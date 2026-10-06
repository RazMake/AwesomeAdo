import type { TypeCatalogEntry } from "../../common/ado/TrackedWorkItem";
import { workItemTypeDisplayColor } from "../../common/ado/workItemTypes";
import type { IItemCollection } from "../../common/item-collection/ItemCollection";
import {
  formatCollectedIds,
  formatCollectedLinksHtml,
  formatCollectedLinksText,
} from "../../common/item-collection/formatCollection";
import type { ILogger } from "../../common/logging/ILogger";
import type {
  ItemCollectorPosition,
  RelativeViewportPosition,
  Theme,
} from "../../common/settings/ExtensionSettings";
import { renderItemTypeIcon } from "../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";
import {
  createPopupHost,
  type PopupHost,
} from "../../common/view-common/control/popupHost/popupHost";
import { createSvgCanvas } from "../../common/view-common/control/svgIcon/svgIcon";
import { THEME_COLOR_VARIABLES } from "../../common/view-common/themes/ThemeDefinition";
import { resolveTheme } from "../../common/view-common/themes/themes";
import { detectAdoTheme } from "../ado-probe/AdoThemeProbe";

import { renderCollectedItemsDialog, type CollectedItemsDialog } from "./CollectedItemsDialog";
import { showAddedBurst } from "./addedBurst";
import { attachCtrlClickCollector, type DisposeCtrlClickCollector } from "./ctrlClickCollector";

const ROOT_ID = "awesomeado-item-collector";
const PREFIX = "awesomeado-item-collector";
// Above the enhanced-view overlay (1000) but one below the item context menu, which may open over it.
const COLLECTOR_Z_INDEX = "2147483646";
const DRAG_THRESHOLD = 4;
const NEAR_POINTER_OFFSET_PX = 16;

/** One command in the collector's own menu. */
interface CollectorCommand {
  label: string;
  disabledReason: string | null;
  run: () => void;
}

interface CollectorDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  left: number;
  top: number;
  width: number;
  height: number;
  moved: boolean;
}

/**
 * The floating counter shown while a work item collection runs, its command menu, and the
 * collected-items dialog.
 *
 * Mounted on the page body rather than inside a view, so it survives the enhanced view being
 * repainted for another query — or replaced by ADO's own page. Everything it holds (DOM, the Ctrl+click
 * listener, the re-attach observer) exists only while the collection is active and is released the
 * moment it ends.
 */
export class ItemCollectorWidget {
  private root: HTMLElement | undefined;
  private button: HTMLButtonElement | undefined;
  private countLabel: HTMLElement | undefined;
  private menu: PopupHost | undefined;
  private dialog: CollectedItemsDialog | undefined;
  private observer: MutationObserver | undefined;
  private detachCtrlClick: DisposeCtrlClickCollector | undefined;
  private drag: CollectorDrag | undefined;
  private suppressNextClick = false;
  private theme: Theme = "auto";
  private position: ItemCollectorPosition = null;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly doc: Document,
    private readonly collection: IItemCollection,
    private readonly resolveType: (type: string) => TypeCatalogEntry | undefined,
    private readonly logger: ILogger,
    private readonly persistPosition: (position: RelativeViewportPosition) => Promise<void>,
  ) {
    this.unsubscribe = collection.subscribe(() => this.sync());
    // Capture phase: menus stop propagation, and the point must be known before the collection starts.
    doc.addEventListener("pointerdown", this.rememberPointer, true);
    this.sync();
  }

  private lastPointer: { x: number; y: number } | undefined;

  private readonly rememberPointer = (event: PointerEvent): void => {
    this.lastPointer = { x: event.clientX, y: event.clientY };
  };

  /** Apply the selected AwesomeADO theme; the widget lives outside the themed view host. */
  applyTheme(theme: Theme): void {
    this.theme = theme;
    this.applyThemeToRoot();
  }

  /** Apply the synced position; null restores the bottom-right default. */
  applyPosition(position: ItemCollectorPosition): void {
    this.position = position;
    this.placeAtSavedPosition();
  }

  /** Stop following the collection and release everything (page teardown). */
  dispose(): void {
    this.unsubscribe();
    this.doc.removeEventListener("pointerdown", this.rememberPointer, true);
    this.release();
  }

  private sync(): void {
    if (!this.collection.isActive) {
      this.release();
      return;
    }
    this.mount();
    const count = this.collection.items().length;
    if (this.countLabel) this.countLabel.textContent = String(count);
    this.root
      ?.querySelector("button")
      ?.setAttribute(
        "aria-label",
        `Collected work items: ${count}. Open collected items; right-click for commands.`,
      );
    this.dialog?.refresh();
  }

  private mount(): void {
    if (this.root) return;
    const root = this.doc.createElement("div");
    root.id = ROOT_ID;
    root.style.cssText = [
      "position:fixed",
      "right:24px",
      "bottom:24px",
      `z-index:${COLLECTOR_Z_INDEX}`,
      'font:13px "Segoe UI", system-ui, sans-serif',
      "color:var(--text-primary-color)",
    ].join(";");
    const button = this.renderButton();
    this.button = button;
    root.append(button);
    this.root = root;
    this.applyThemeToRoot();
    this.menu = createPopupHost({
      doc: this.doc,
      trigger: button,
      mountInto: root,
      buildPopup: (close) => this.renderMenu(close),
      interactive: false,
    });
    button.addEventListener("click", this.handleClick);
    button.addEventListener("contextmenu", this.handleContextMenu);
    button.addEventListener("pointerdown", this.handlePointerDown);
    this.attach();
    this.placeAtSavedPosition();
    this.placeNearLastPointer();
    this.doc.defaultView?.addEventListener("resize", this.placeAtSavedPosition);
    // ADO re-renders its page and drops foreign nodes; put the counter back whenever that happens.
    this.observer = new MutationObserver(() => this.attach());
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true });
    this.detachCtrlClick = attachCtrlClickCollector(this.doc, () => this.root ?? null, {
      countItems: () => this.collection.items().length,
      celebrate: (x, y) => this.celebrateAddition(x, y),
    });
    this.doc.addEventListener("keydown", this.handleEscape);
  }

  /** The collection keeps insertion order, so the item a Ctrl+click just added is the last one. */
  private celebrateAddition(x: number, y: number): void {
    const added = this.collection.items().at(-1);
    if (!added) return;
    const entry = this.resolveType(added.type);
    const color = workItemTypeDisplayColor(entry?.color);
    const icon = renderItemTypeIcon(this.doc, {
      iconUrl: entry?.icon ?? null,
      color,
      typeName: added.type,
      title: "",
    }).element;
    showAddedBurst(this.doc, x, y, { icon, color });
  }

  private attach(): void {
    if (this.root && !this.root.isConnected) {
      (this.doc.body ?? this.doc.documentElement).append(this.root);
    }
  }

  private release(): void {
    this.stopDrag();
    this.doc.removeEventListener("keydown", this.handleEscape);
    this.doc.defaultView?.removeEventListener("resize", this.placeAtSavedPosition);
    this.detachCtrlClick?.();
    this.detachCtrlClick = undefined;
    this.observer?.disconnect();
    this.observer = undefined;
    this.menu?.close();
    this.menu = undefined;
    this.closeDialog();
    this.root?.remove();
    this.root = undefined;
    this.button = undefined;
    this.countLabel = undefined;
  }

  private renderButton(): HTMLButtonElement {
    const button = this.doc.createElement("button");
    button.type = "button";
    button.className = `${PREFIX}__button`;
    button.title =
      "Collected work items — click to view, right-click for commands, or drag to move";
    button.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "gap:6px",
      "padding:8px 12px",
      "border:1px solid var(--control-border-strong)",
      "border-radius:999px",
      "background:var(--callout-background-color)",
      "color:var(--text-primary-color)",
      "box-shadow:0 2px 8px var(--shadow-subtle)",
      "font:inherit",
      "font-weight:600",
      "cursor:pointer",
      "touch-action:none",
      "user-select:none",
    ].join(";");
    const count = this.doc.createElement("span");
    count.className = `${PREFIX}__count`;
    this.countLabel = count;
    button.append(renderCollectorGlyph(this.doc), count);
    return button;
  }

  private renderMenu(close: () => void): HTMLElement {
    const menu = this.doc.createElement("div");
    menu.className = `${PREFIX}__menu`;
    menu.setAttribute("role", "menu");
    // Opens above the bottom-right counter, right-aligned to it, so it never leaves the window.
    menu.style.cssText = [
      "position:absolute",
      "right:0",
      "bottom:100%",
      "margin-bottom:6px",
      "width:max-content",
      "padding:4px",
      "background:var(--callout-background-color)",
      "border:1px solid var(--control-border-strong)",
      "border-radius:10px",
      "box-shadow:0 2px 8px var(--shadow-subtle)",
    ].join(";");
    for (const command of this.commands()) {
      menu.append(renderMenuRow(this.doc, command, close));
    }
    return menu;
  }

  private commands(): CollectorCommand[] {
    const items = this.collection.items();
    const empty = items.length === 0 ? "Nothing collected yet." : null;
    return [
      {
        label: "Copy all Ids to clipboard",
        disabledReason: empty,
        run: () => void this.copyIds(),
      },
      {
        label: "Copy all ADO links to clipboard",
        disabledReason: empty,
        run: () => void this.copyUrls(),
      },
      { label: "End collection", disabledReason: null, run: () => this.collection.end() },
    ];
  }

  private copyIds(): Promise<void> {
    return this.copy("ids", formatCollectedIds(this.collection.items()));
  }

  private copyUrls(): Promise<void> {
    const items = this.collection.items();
    return this.copy("links", formatCollectedLinksText(items), formatCollectedLinksHtml(items));
  }

  private openDialog(): void {
    if (!this.root || this.dialog) return;
    const dialog = renderCollectedItemsDialog(this.doc, {
      collection: this.collection,
      resolveType: this.resolveType,
      onClose: () => this.closeDialog(),
      onCopyIds: () => void this.copyIds(),
      onCopyUrls: () => void this.copyUrls(),
    });
    this.dialog = dialog;
    this.root.append(dialog.element);
  }

  private closeDialog(): void {
    this.dialog?.element.remove();
    this.dialog = undefined;
  }

  /**
   * Document-level because neither the counter nor the dialog holds focus. Escape peels one layer:
   * an open list closes first, so a reader dismissing it does not lose the collection too.
   */
  private readonly handleEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (this.dialog) {
      this.closeDialog();
      return;
    }
    this.logger.info("Ended the work item collection from the Escape key.");
    this.collection.end();
  };

  private readonly handleClick = (): void => {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    this.openDialog();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.menu?.toggle();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.root || !this.button || this.drag) return;
    const rect = this.button.getBoundingClientRect();
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    this.doc.addEventListener("pointermove", this.handlePointerMove);
    this.doc.addEventListener("pointerup", this.handlePointerUp);
    this.doc.addEventListener("pointercancel", this.handlePointerCancel);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    const root = this.root;
    const view = this.doc.defaultView;
    if (!drag || !root || !view || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      this.menu?.close();
    }
    event.preventDefault();
    drag.left = clamp(drag.startLeft + deltaX, 0, Math.max(0, view.innerWidth - drag.width));
    drag.top = clamp(drag.startTop + deltaY, 0, Math.max(0, view.innerHeight - drag.height));
    setFixedPosition(root, drag.left, drag.top);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;
    this.stopDrag();
    if (!drag.moved) return;
    this.suppressNextClick = true;
    const view = this.doc.defaultView;
    if (!view) return;
    const position = {
      x: fractionOfAvailableSpace(drag.left, view.innerWidth, drag.width),
      y: fractionOfAvailableSpace(drag.top, view.innerHeight, drag.height),
    };
    this.position = position;
    this.placeAtSavedPosition();
    void this.persistPosition(position).catch((error: unknown) => {
      this.logger.error("Could not save the work item collector position.", error);
    });
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.drag && event.pointerId === this.drag.pointerId) {
      this.stopDrag();
      this.placeAtSavedPosition();
    }
  };

  private stopDrag(): void {
    this.drag = undefined;
    this.doc.removeEventListener("pointermove", this.handlePointerMove);
    this.doc.removeEventListener("pointerup", this.handlePointerUp);
    this.doc.removeEventListener("pointercancel", this.handlePointerCancel);
  }

  /**
   * A collection starts from a click far from the saved corner; appearing beside that click shows the
   * reader the counter exists. Not persisted — the saved spot returns on resize or the next drag.
   */
  private placeNearLastPointer(): void {
    const root = this.root;
    const button = this.button;
    const view = this.doc.defaultView;
    const point = this.lastPointer;
    if (!root || !button || !view || !point) return;
    const rect = button.getBoundingClientRect();
    const left = clamp(
      point.x + NEAR_POINTER_OFFSET_PX,
      0,
      Math.max(0, view.innerWidth - rect.width),
    );
    const top = clamp(
      point.y + NEAR_POINTER_OFFSET_PX,
      0,
      Math.max(0, view.innerHeight - rect.height),
    );
    setFixedPosition(root, left, top);
  }

  private readonly placeAtSavedPosition = (): void => {
    const root = this.root;
    const button = this.button;
    const view = this.doc.defaultView;
    if (!root || !button || !view || this.drag) return;
    if (this.position === null) {
      root.style.removeProperty("left");
      root.style.removeProperty("top");
      root.style.right = "24px";
      root.style.bottom = "24px";
      return;
    }
    const rect = button.getBoundingClientRect();
    const left = this.position.x * Math.max(0, view.innerWidth - rect.width);
    const top = this.position.y * Math.max(0, view.innerHeight - rect.height);
    setFixedPosition(root, left, top);
  };

  /**
   * Writes the collection to the clipboard, as rich text too when given HTML so a paste into mail or
   * chat keeps each id a link. A refused write is logged: the menu has already closed by then and has
   * nowhere else to report it.
   */
  private async copy(what: string, text: string, html?: string): Promise<void> {
    try {
      const view = this.doc.defaultView;
      const clipboard = view?.navigator.clipboard;
      if (!clipboard) throw new Error("navigator.clipboard is unavailable in this context.");
      if (html !== undefined && typeof view.ClipboardItem === "function") {
        await clipboard.write([
          new view.ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      } else {
        await clipboard.writeText(text);
      }
      this.logger.info(`Copied ${this.collection.items().length} collected item ${what}.`);
    } catch (error) {
      this.logger.error(`Could not copy the collected item ${what} to the clipboard.`, error);
    }
  }

  private applyThemeToRoot(): void {
    if (!this.root) return;
    const resolved = resolveTheme(
      this.theme,
      this.theme === "auto" ? detectAdoTheme(this.doc) : null,
    );
    THEME_COLOR_VARIABLES.forEach((variable) =>
      this.root?.style.setProperty(variable, resolved.colors[variable]),
    );
    this.root.style.setProperty("color-scheme", resolved.colorScheme);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function fractionOfAvailableSpace(position: number, viewport: number, itemSize: number): number {
  const available = viewport - itemSize;
  return available > 0 ? clamp(position / available, 0, 1) : 0;
}

function setFixedPosition(element: HTMLElement, left: number, top: number): void {
  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
  element.style.right = "auto";
  element.style.bottom = "auto";
}

function renderMenuRow(
  doc: Document,
  command: CollectorCommand,
  close: () => void,
): HTMLButtonElement {
  const row = doc.createElement("button");
  row.type = "button";
  row.className = `${PREFIX}__command`;
  row.setAttribute("role", "menuitem");
  row.textContent = command.label;
  row.style.cssText = [
    "display:block",
    "width:100%",
    "text-align:left",
    "padding:6px 10px",
    "border:none",
    "border-radius:6px",
    "background-color:transparent",
    "color:inherit",
    "font:inherit",
    "font-size:12px",
    "white-space:nowrap",
    "cursor:pointer",
  ].join(";");
  if (command.disabledReason !== null) {
    row.disabled = true;
    row.title = command.disabledReason;
    row.style.opacity = "0.45";
    row.style.cursor = "default";
    return row;
  }
  const paintHover = (hovered: boolean): void => {
    row.style.backgroundColor = hovered ? "var(--control-background-hover)" : "transparent";
  };
  row.addEventListener("mouseenter", () => paintHover(true));
  row.addEventListener("mouseleave", () => paintHover(false));
  row.addEventListener("click", () => {
    // Run before closing so a clipboard write still happens under this click's user activation.
    command.run();
    close();
  });
  return row;
}

/** A small stacked-cards glyph: "a pile of gathered items". */
function renderCollectorGlyph(doc: Document): SVGSVGElement {
  const svg = createSvgCanvas(doc, "flex:none");
  const ns = "http://www.w3.org/2000/svg";
  for (const [y, opacity] of [
    [2, "0.45"],
    [5, "0.7"],
    [8, "1"],
  ] as const) {
    const card = doc.createElementNS(ns, "rect");
    card.setAttribute("x", "2");
    card.setAttribute("y", String(y));
    card.setAttribute("width", "12");
    card.setAttribute("height", "6");
    card.setAttribute("rx", "1.5");
    card.setAttribute("fill", "currentColor");
    card.setAttribute("opacity", opacity);
    svg.append(card);
  }
  return svg;
}
