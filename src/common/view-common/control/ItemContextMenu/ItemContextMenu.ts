import type { ILogger } from "../../../logging/ILogger";
import { createPopupHost, type PopupHost } from "../popupHost/popupHost";

/**
 * One caller-supplied command in the menu's second group.
 *
 * Exactly one of `run`, `panel` and `submenu` gives the command its behaviour. They are separate
 * fields rather than one polymorphic callback because the MENU has to treat them differently: an
 * action dismisses, a panel takes over the surface, and a submenu opens beside the row.
 */
export interface ItemContextMenuCommand {
  label: string;
  /** Style declarations for the label (e.g. a sprint's relation color); omitted uses the theme's. */
  declarations?: [string, string][];
  /** Runs the command and closes the menu. */
  run?: () => void;
  /**
   * Replaces the menu's commands with the element this builds — an editor, a list, a discussion.
   * `close` dismisses the whole menu. The surface stays exactly where the reader right-clicked, so a
   * command opens where they were looking rather than somewhere they then have to find.
   */
  panel?: (close: () => void) => HTMLElement;
  /**
   * Centre the panel in the window instead of anchoring it to the pointer.
   *
   * For a panel big enough that where the pointer happened to be stops being a useful place to put
   * it: anchored, a surface taking most of the window is shoved around by the corrections that keep
   * it on screen, and lands somewhere different for every row it was opened from.
   */
  centerPanel?: boolean;
  /** Nested commands, shown in a flyout beside this row. Built on open, so it can read live state. */
  submenu?: () => ItemContextMenuCommand[];
  /** Dimmed and inert, with this as the tooltip saying why. Overrides the three above. */
  disabledReason?: string | null;
}

/** The work item a menu acts on. */
export interface ItemContextMenuTarget {
  /** The work item's id — what "Copy Item ID" writes to the clipboard. */
  id: number;
  /**
   * The item's Azure DevOps deep link. Null leaves both URL commands visibly inert rather than
   * removing them: a menu that changes shape between rows is harder to use than one whose commands
   * stay in the same place and say why they cannot run.
   */
  url: string | null;
  /**
   * Commands specific to this item, shown under a separator beneath the three every menu carries.
   *
   * Supplied by the caller rather than built here so the menu stays a MENU: what it means to rename
   * a work item, where its description is persisted and which sprints it may move to are facts about
   * the owning view's data, not about showing a list of commands.
   */
  commands?: ItemContextMenuCommand[];
}

/** Configuration for the shared item context menu. */
export interface ItemContextMenuOptions {
  doc: Document;
  /**
   * Where the menu's pointer anchor is mounted. Give it an element the OWNING VIEW discards when it
   * is torn down (its board root, not `document.body`): the anchor outlives any single repaint, so
   * mounting it on the document would strand one invisible node per view that ever opened a menu.
   */
  mountInto: HTMLElement;
  /** Records a clipboard write that never landed — see `copyToClipboard`. */
  logger: ILogger;
}

/** A shared, single-instance context menu that any number of rows can open. */
export interface ItemContextMenu {
  /**
   * Opens the menu for `target` at the pointer, replacing whatever was open. Suppresses the
   * browser's own menu and stops the event, so the INNERMOST row under the pointer wins.
   */
  openAt(event: MouseEvent, target: ItemContextMenuTarget): void;
  /** Closes the menu if open (idempotent). */
  close(): void;
}

const COPY_ID_LABEL = "Copy Item ID";
const COPY_URL_LABEL = "Copy ADO Url";
const OPEN_LABEL = "Open in ADO";

/** What an inert URL command tells the reader when it is hovered. */
const NO_URL_REASON = "This page's address does not resolve to an Azure DevOps project.";

/**
 * The menu sits above everything the extension itself draws — including the enhanced-view overlay
 * (`z-index:1000`) and the popups mounted inside it, which it can be opened on top of.
 */
const MENU_Z_INDEX = 2147483647;

/**
 * The wash the command under the pointer takes, and the menu's own edge.
 *
 * Fixed translucent greys, NOT `--palette-neutral-4` / `--palette-neutral-20`: a pinned theme sets
 * those to its own neutrals, but under "Follow ADO" they fall through to ADO's, which are the very
 * surface colors this menu is painted with — so the highlighted command was indistinguishable from
 * the rest of the menu on exactly the theme most people run. Grey at a low alpha composites the
 * other way on both, darkening a light surface and lightening a dark one. Same trap as the
 * AssignedTo result highlight, the EtaBadge popup chrome and the rollup checkbox's frame: a neutral
 * token is fine for a wash ON a surface, never for something that must be told APART from it.
 */
const ROW_HOVER_BACKGROUND = "rgba(128,128,128,0.28)";
const MENU_BORDER = "1px solid rgba(128,128,128,0.5)";

/** How much clear space a repositioned surface keeps from the window's edge. */
const WINDOW_MARGIN_PX = 8;

/**
 * "Open in ADO" is the one command that leaves the page, so it is the one command drawn in a hue
 * rather than in the theme's text color — colour is what separates "this changes tabs" from the two
 * commands that quietly fill the clipboard and leave you where you are.
 *
 * One fixed blue cannot carry that on every theme: the shade that reads on a light surface goes
 * muddy on a dark one. `light-dark()` picks per surface, which works because the view host always
 * declares a concrete `color-scheme`. The flat blue is assigned FIRST as the fallback, so an engine
 * that cannot parse `light-dark()` drops only the second assignment and still gets an accent.
 */
const OPEN_COMMAND_COLOR = "rgb(0,120,212)";
const OPEN_COMMAND_COLOR_BY_SCHEME = "light-dark(rgb(0,90,158), rgb(96,175,255))";

/**
 * One command row. Every command is a `<button>`, including the one that opens a tab: an `<a>` would
 * have to survive the menu being torn down in its own click handler, and whether a detached anchor
 * still navigates is left to the engine.
 */
function renderCommandRow(doc: Document, label: string): HTMLButtonElement {
  const row = doc.createElement("button");
  row.className = "awesomeado-item-menu__command";
  row.type = "button";
  row.setAttribute("role", "menuitem");
  row.textContent = label;
  row.style.cssText = [
    "display:block",
    "width:100%",
    "box-sizing:border-box",
    "text-align:left",
    "border:none",
    "background-color:transparent",
    "padding:6px 14px",
    "font:inherit",
    "font-size:12px",
    "line-height:1.6",
    "color:var(--text-primary-color, #323130)",
    "white-space:nowrap",
    "cursor:pointer",
  ].join(";");
  row.addEventListener("mouseenter", () => {
    row.style.backgroundColor = ROW_HOVER_BACKGROUND;
  });
  row.addEventListener("mouseleave", () => {
    row.style.backgroundColor = "transparent";
  });
  return row;
}

/** Dims a command that cannot run and takes its affordances away, leaving it in place to say why. */
function makeInert(row: HTMLButtonElement, reason = NO_URL_REASON): HTMLButtonElement {
  row.disabled = true;
  row.style.opacity = "0.45";
  row.style.cursor = "default";
  row.title = reason;
  return row;
}

/**
 * Writes `text` to the system clipboard.
 *
 * This is the one part of a command that can fail outside the extension's control — the page can
 * have lost focus, or clipboard access can be denied — and it fails INVISIBLY, because by then the
 * menu has closed and has nowhere left to report it. So the rejection is recorded rather than
 * dropped: Diagnostics is what answers "why is my clipboard still empty?".
 */
async function copyToClipboard(
  doc: Document,
  text: string,
  label: string,
  logger: ILogger,
): Promise<void> {
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (!clipboard) {
      throw new Error("navigator.clipboard is unavailable in this context.");
    }
    await clipboard.writeText(text);
  } catch (error) {
    logger.error(`"${label}" could not write "${text}" to the clipboard.`, error);
  }
}

/** A command that fills the clipboard; `text` of null renders it inert. */
function renderCopyCommand(
  doc: Document,
  label: string,
  text: string | null,
  close: () => void,
  logger: ILogger,
): HTMLButtonElement {
  const row = renderCommandRow(doc, label);
  if (text === null) {
    return makeInert(row);
  }
  row.addEventListener("click", () => {
    // Started before the menu is torn down so the write still runs under the click's user
    // activation, which is what the clipboard API grants access on.
    void copyToClipboard(doc, text, label, logger);
    close();
  });
  return row;
}

/** The accented command that opens the item in a new tab; `url` of null renders it inert. */
function renderOpenCommand(
  doc: Document,
  url: string | null,
  close: () => void,
): HTMLButtonElement {
  const row = renderCommandRow(doc, OPEN_LABEL);
  row.style.color = OPEN_COMMAND_COLOR;
  row.style.color = OPEN_COMMAND_COLOR_BY_SCHEME;
  if (url === null) {
    return makeInert(row);
  }
  row.addEventListener("click", () => {
    // `noopener` so the opened Azure DevOps tab cannot reach back into the page the extension runs
    // in; it also makes the call return null, which is why nothing is done with the result.
    doc.defaultView?.open(url, "_blank", "noopener");
    close();
  });
  return row;
}

/** Builds the menu surface and its three commands. */
function buildMenu(
  doc: Document,
  target: ItemContextMenuTarget,
  close: () => void,
  logger: ILogger,
): HTMLElement {
  const menu = doc.createElement("div");
  menu.className = "awesomeado-item-menu";
  menu.setAttribute("role", "menu");
  // Anchored under the pointer via the zero-sized anchor it is mounted in, on the same themed
  // callout surface every other popup control uses so the board's menus read alike.
  menu.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    `border:${MENU_BORDER}`,
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    "min-width:160px",
    // Sized from its OWN rows, not shrink-to-fit. The menu is absolutely positioned inside a
    // zero-width anchor, so "available width" is nothing at all: it collapsed onto the 160px floor
    // and folded every longer command — a sprint label, a whole discussion — onto a second line.
    // `max-content` takes the width the rows actually want, which no `max-width` could restore.
    "width:max-content",
    `max-width:calc(100vw - ${2 * WINDOW_MARGIN_PX}px)`,
    "padding:4px 0",
    "z-index:1000",
  ].join(";");
  // Right-clicking the menu itself must not hand the browser's own menu back over the top of it.
  menu.addEventListener("contextmenu", (event) => event.preventDefault());

  const commands = doc.createElement("div");
  commands.className = "awesomeado-item-menu__commands";
  commands.append(
    renderCopyCommand(doc, COPY_ID_LABEL, String(target.id), close, logger),
    renderCopyCommand(doc, COPY_URL_LABEL, target.url, close, logger),
    renderOpenCommand(doc, target.url, close),
  );

  // The caller's commands act ON the item; the three above only describe it. The rule separates two
  // groups that answer different questions, so a mis-click cannot cross between "tell me about this"
  // and "change this".
  if (target.commands?.length) {
    commands.append(renderSeparator(doc));
    for (const command of target.commands) {
      commands.append(renderCustomCommand(doc, command, menu, close));
    }
  }

  menu.append(commands);
  return menu;
}

/** The rule dividing the menu's two groups. */
function renderSeparator(doc: Document): HTMLElement {
  const rule = doc.createElement("div");
  rule.className = "awesomeado-item-menu__separator";
  rule.setAttribute("role", "separator");
  // The same fixed grey the menu's own edge uses, for the same Follow-ADO reason.
  rule.style.cssText = [
    "height:0",
    `border-top:${MENU_BORDER}`,
    "margin:4px 0",
    "opacity:0.7",
  ].join(";");
  return rule;
}

/**
 * One caller-supplied command, in whichever of its three shapes it was given.
 *
 * `menu` is the surface a `panel` command takes over: swapping the menu's contents (rather than
 * opening a second popup) keeps ONE thing on screen anchored where the reader right-clicked, and
 * leaves the popup host's dismissal contract covering the editor too.
 */
function renderCustomCommand(
  doc: Document,
  command: ItemContextMenuCommand,
  menu: HTMLElement,
  close: () => void,
): HTMLElement {
  const row = renderCommandRow(doc, command.label);
  for (const [property, value] of command.declarations ?? []) {
    row.style.setProperty(property, value);
  }

  if (command.disabledReason) {
    return makeInert(row, command.disabledReason);
  }

  if (command.submenu) {
    return renderSubmenu(doc, row, command.submenu, menu, close);
  }

  if (command.panel) {
    const panel = command.panel;
    row.addEventListener("click", () => {
      // Padded here rather than by each panel: the menu's own padding is vertical only, because its
      // rows run edge to edge to give the hover wash the full width.
      const surface = doc.createElement("div");
      surface.className = "awesomeado-item-menu__panel";
      surface.style.cssText = "padding:8px 10px";
      surface.append(panel(close));
      menu.replaceChildren(surface);
      if (command.centerPanel) {
        centerInWindow(menu);
      } else {
        keepPanelInView(menu, doc);
      }
    });
    return row;
  }

  const run = command.run;
  row.addEventListener("click", () => {
    run?.();
    close();
  });
  return row;
}

/** How far a flyout is pulled up so its first row lines up with the row that opened it. */
const SUBMENU_TOP_OFFSET_PX = 4;
/**
 * A command that opens a flyout of nested commands beside itself.
 *
 * The flyout is built on OPEN rather than up front: its contents describe live state (which sprints
 * an item may still move to), and a list built when the menu was rendered would answer for the item
 * as it was rather than as it is.
 */
function renderSubmenu(
  doc: Document,
  row: HTMLButtonElement,
  build: () => ItemContextMenuCommand[],
  menu: HTMLElement,
  close: () => void,
): HTMLElement {
  const wrapper = doc.createElement("div");
  wrapper.className = "awesomeado-item-menu__submenu-host";
  wrapper.style.cssText = "position:relative";

  // A chevron rather than only a hover behaviour: the row has to say it leads somewhere before it is
  // pointed at, or the commands beneath it look like the whole menu.
  const chevron = doc.createElement("span");
  chevron.textContent = "\u203A";
  chevron.style.cssText = ["float:right", "margin-left:12px", "opacity:0.7"].join(";");
  row.append(chevron);

  let flyout: HTMLElement | null = null;
  const open = (): void => {
    if (flyout) return;
    flyout = doc.createElement("div");
    flyout.className = "awesomeado-item-menu__submenu";
    flyout.setAttribute("role", "menu");
    flyout.style.cssText = [
      "position:absolute",
      "left:100%",
      `top:-${SUBMENU_TOP_OFFSET_PX}px`,
      "background:var(--callout-background-color, var(--background-color, #fff))",
      `border:${MENU_BORDER}`,
      "border-radius:3px",
      "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
      "min-width:160px",
      // Same reason as the menu itself: a flyout of sprint labels is far wider than its floor.
      "width:max-content",
      "max-height:320px",
      "overflow-y:auto",
      "padding:4px 0",
      "z-index:1",
    ].join(";");
    for (const nested of build()) {
      flyout.append(renderCustomCommand(doc, nested, menu, close));
    }
    wrapper.append(flyout);
    keepFlyoutInView(flyout, doc);
  };

  row.addEventListener("click", open);
  // Hover opens it too, which is what every native menu does; leaving the whole wrapper closes it,
  // so moving the pointer INTO the flyout does not dismiss what it is heading for.
  wrapper.addEventListener("mouseenter", open);
  wrapper.addEventListener("mouseleave", () => {
    flyout?.remove();
    flyout = null;
  });

  wrapper.append(row);
  return wrapper;
}

/**
 * Flip a flyout to the other side of its row when it would spill past the right edge.
 *
 * The parent menu is already kept on screen by the popup host, but the host measures the menu it
 * built — a flyout opened later is a child it never sees, and near the right edge it opens straight
 * off the window.
 */
function keepFlyoutInView(flyout: HTMLElement, doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  const rect = flyout.getBoundingClientRect();
  if (rect.width === 0) {
    // Unmeasurable (hidden or detached host): leave the default side alone.
    return;
  }
  if (rect.right > (doc.documentElement.clientWidth || view.innerWidth)) {
    flyout.style.left = "auto";
    flyout.style.right = "100%";
  }
}

/**
 * Pull the menu back inside the window after a panel has widened it.
 *
 * The popup host measured the menu when it held three short command rows, so a several-hundred-pixel
 * editor swapped into it afterwards is a size it never saw — and opened near the right edge, half of
 * the editor lands off screen with its Save button on the wrong side of it.
 */
function keepPanelInView(menu: HTMLElement, doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  const rect = menu.getBoundingClientRect();
  const limit = (doc.documentElement.clientWidth || view.innerWidth) - WINDOW_MARGIN_PX;
  const spill = rect.right - limit;
  if (rect.width === 0 || spill <= 0) {
    return;
  }
  // Never past the opposite edge: fixing one side must not break the other.
  const shift = Math.min(spill, Math.max(rect.left - WINDOW_MARGIN_PX, 0));
  const anchored = Number.parseFloat(view.getComputedStyle(menu).left);
  menu.style.left = `${(Number.isFinite(anchored) ? anchored : 0) - shift}px`;
}

/**
 * Put the menu in the middle of the window, whatever the popup host had already done with it.
 *
 * Every anchoring declaration is overwritten rather than only the ones in the way: by this point the
 * host may have anchored the menu to the viewport, shifted it left, or flipped it above its trigger
 * with a `bottom`/`margin` pair, and a leftover from any of those would drag the centred panel back
 * off the middle.
 */
function centerInWindow(menu: HTMLElement): void {
  menu.style.position = "fixed";
  menu.style.left = "50%";
  menu.style.top = "50%";
  menu.style.right = "auto";
  menu.style.bottom = "auto";
  menu.style.margin = "0";
  menu.style.transform = "translate(-50%, -50%)";
}

/**
 * The board-wide right-click menu for a work item: copy its id, copy its Azure DevOps link, or open
 * that link in a new tab.
 *
 * ONE instance serves every row a view renders, because only one context menu can ever be open. Rows
 * do not own a menu each; they call `openAt` from their own `contextmenu` listener with the item they
 * stand for, so the menu never has to know how a view lays its items out or where a URL came from.
 *
 * Positioning is delegated to the shared popup host through a zero-sized, viewport-fixed anchor moved
 * to the pointer on each open: that is what lets a menu opened at an arbitrary point still inherit
 * the host's whole dismissal contract (outside click, Escape) and its keep-on-screen corrections,
 * which are written against a trigger element rather than a coordinate.
 */
export function createItemContextMenu(options: ItemContextMenuOptions): ItemContextMenu {
  const { doc, mountInto, logger } = options;

  // Reused rather than built per open: the popup host removes only the popup it built, so a fresh
  // anchor each time would leave one stray node behind for every right-click.
  const anchor = doc.createElement("span");
  anchor.className = "awesomeado-item-menu__anchor";
  anchor.style.cssText = ["position:fixed", "width:0", "height:0", `z-index:${MENU_Z_INDEX}`].join(
    ";",
  );

  let host: PopupHost | null = null;

  const close = (): void => {
    host?.close();
    host = null;
  };

  const openAt = (event: MouseEvent, target: ItemContextMenuTarget): void => {
    // Replace the browser's menu rather than compete with it, and let the innermost row under the
    // pointer win: a rolled-up child row lives INSIDE its parent's row, so without stopping the event
    // the parent's listener would fire second and overwrite the child's menu with its own.
    event.preventDefault();
    event.stopPropagation();
    close();

    if (target.url === null) {
      logger.info(
        `Item ${target.id} context menu: URL commands inert — the page address does not resolve to an ADO project.`,
      );
    }

    anchor.style.left = `${event.clientX}px`;
    anchor.style.top = `${event.clientY}px`;
    mountInto.append(anchor);

    host = createPopupHost({
      doc,
      trigger: anchor,
      mountInto: anchor,
      // There is nothing to click: the menu is opened by a right-click the caller reports, not by a
      // trigger of its own.
      interactive: false,
      // A command can swap an editor into this surface, and there Escape is how the author abandons
      // what they are typing — taking the whole menu with it would close the discussion they opened
      // the editor from. A second Escape, with nothing left editing, still dismisses the menu.
      dismissOnFieldEscape: false,
      buildPopup: (dismiss) => buildMenu(doc, target, dismiss, logger),
    });
    host.toggle();
  };

  return { openAt, close };
}
