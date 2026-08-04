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
  /** Tooltip for the command row; useful when its compact label abbreviates a full value. */
  title?: string;
  /**
   * Builds the row's visible content instead of rendering `label` as plain text — for a command that
   * has to SHOW the thing it acts on (a colored condition pill) rather than name it, because the
   * color is the meaning. `label` stays required and is what the row announces to assistive
   * technology, so the command is never nameless to a screen reader.
   */
  renderLabel?: (doc: Document) => Node[];
  /**
   * A checkbox rendered beside the command button in the same visual row.
   *
   * Kept as a sibling rather than nested inside the button: nested interactive controls are invalid
   * HTML and make keyboard activation ambiguous. Changing it leaves the menu open; clicking the
   * command button still runs the command with whatever state the caller retained.
   */
  checkbox?: {
    label: string;
    checked?: boolean;
    disabledReason?: string | null;
    onChange(checked: boolean): void;
  };
  /**
   * Draws a rule above this command, splitting the caller's list into groups. Use it where the
   * commands beneath answer a different question from the ones above ("edit this item" vs. "flag
   * this item"), so a mis-click cannot cross between them.
   */
  separatorBefore?: boolean;
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
  /** Adds a maximize/restore button that expands the panel inside the configured bounds. */
  maximizablePanel?: boolean;
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
  /** Which standard rows appear; omitted keeps Copy ID, Copy URL, and Open in ADO. */
  standardCommands?: readonly ("copy-id" | "copy-url" | "open")[];
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
  /** Resolves the live surface a maximized panel must stay inside. Defaults to the viewport. */
  panelBounds?: () => Element | null;
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
 * Dedicated control roles keep the highlighted command and menu edge distinct from their surface
 * on every palette.
 */
const ROW_HOVER_BACKGROUND = "var(--control-background-hover)";
const MENU_BORDER = "1px solid var(--control-border-strong)";

/**
 * The menu surface's corner radius, the inset its rows sit in, and the rows' own radius.
 *
 * Rounded like the board's other floating surfaces (the rolled-up children popup) so a right-click
 * menu reads as one of this extension's controls rather than as browser chrome. The rows are inset
 * by `MENU_PADDING_PX` and rounded by exactly that much less, so a hovered command's wash nests
 * inside the menu's curve instead of cutting across it — which is why the rows no longer run edge to
 * edge.
 */
const MENU_RADIUS_PX = 10;
const MENU_PADDING_PX = 4;
const ROW_RADIUS_PX = MENU_RADIUS_PX - MENU_PADDING_PX;

/** How much clear space a repositioned surface keeps from the window's edge. */
const WINDOW_MARGIN_PX = 8;
/** Maximized panels leave a narrow edge inside the enhanced-view surface. */
const MAXIMIZED_PANEL_MARGIN_PX = 10;

/**
 * "Open in ADO" is the one command that leaves the page, so it is the one command drawn in a hue
 * rather than in the theme's text color — colour is what separates "this changes tabs" from the two
 * commands that quietly fill the clipboard and leave you where you are.
 *
 * The theme's accent role keeps this command distinct on every concrete palette.
 */
const OPEN_COMMAND_COLOR = "var(--open-command-foreground)";

/**
 * One command row. Every command is a `<button>`, including the one that opens a tab: an `<a>` would
 * have to survive the menu being torn down in its own click handler, and whether a detached anchor
 * still navigates is left to the engine.
 *
 * `content` replaces the plain-text label for a command that has to show a rendered thing (a colored
 * pill); the row is still LABELLED by `label` in that case, so it stays announceable.
 */
function renderCommandRow(doc: Document, label: string, content?: Node[]): HTMLButtonElement {
  const row = doc.createElement("button");
  row.className = "awesomeado-item-menu__command";
  row.type = "button";
  row.setAttribute("role", "menuitem");
  if (content === undefined) {
    row.textContent = label;
  } else {
    row.setAttribute("aria-label", label);
    row.append(...content);
  }
  row.style.cssText = [
    "display:block",
    "width:100%",
    "box-sizing:border-box",
    "text-align:left",
    "border:none",
    "background-color:transparent",
    `border-radius:${ROW_RADIUS_PX}px`,
    "padding:6px 10px",
    "font:inherit",
    "font-size:12px",
    "line-height:1.6",
    "color:var(--text-primary-color)",
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
  panelBounds?: () => Element | null,
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
    "background:var(--callout-background-color)",
    `border:${MENU_BORDER}`,
    `border-radius:${MENU_RADIUS_PX}px`,
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "min-width:160px",
    // Sized from its OWN rows, not shrink-to-fit. The menu is absolutely positioned inside a
    // zero-width anchor, so "available width" is nothing at all: it collapsed onto the 160px floor
    // and folded every longer command — a sprint label, a whole discussion — onto a second line.
    // `max-content` takes the width the rows actually want, which no `max-width` could restore.
    "width:max-content",
    `max-width:calc(100vw - ${2 * WINDOW_MARGIN_PX}px)`,
    `padding:${MENU_PADDING_PX}px`,
    "z-index:1000",
  ].join(";");
  // Right-clicking the menu itself must not hand the browser's own menu back over the top of it.
  menu.addEventListener("contextmenu", (event) => event.preventDefault());

  const commands = doc.createElement("div");
  commands.className = "awesomeado-item-menu__commands";
  const standard = target.standardCommands ?? ["copy-id", "copy-url", "open"];
  for (const command of standard) {
    if (command === "copy-id") {
      commands.append(renderCopyCommand(doc, COPY_ID_LABEL, String(target.id), close, logger));
    } else if (command === "copy-url") {
      commands.append(renderCopyCommand(doc, COPY_URL_LABEL, target.url, close, logger));
    } else {
      commands.append(renderOpenCommand(doc, target.url, close));
    }
  }

  // The caller's commands act ON the item; the three above only describe it. The rule separates two
  // groups that answer different questions, so a mis-click cannot cross between "tell me about this"
  // and "change this".
  if (target.commands?.length) {
    // One rule per gap: the boundary under the standard commands and a `separatorBefore` on the
    // caller's FIRST command describe the same gap, so drawing both put two lines there.
    let separateNext = standard.length > 0;
    for (const command of target.commands) {
      // A caller can split its own list further; the rule reads the same as the one above so the
      // menu has one visual language for "these answer a different question".
      if (separateNext || command.separatorBefore === true) {
        commands.append(renderSeparator(doc));
      }
      separateNext = false;
      commands.append(renderCustomCommand(doc, command, menu, close, panelBounds));
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
  // The separator shares the menu edge role so the two groups read as one surface.
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
  panelBounds?: () => Element | null,
): HTMLElement {
  const row = renderCommandRow(doc, command.label, command.renderLabel?.(doc));
  row.title = command.title ?? "";
  for (const [property, value] of command.declarations ?? []) {
    row.style.setProperty(property, value);
  }

  if (command.disabledReason) {
    return makeInert(row, command.disabledReason);
  }

  if (command.checkbox) {
    return renderCheckboxCommand(doc, row, command, menu, close, panelBounds);
  }

  if (command.submenu) {
    return renderSubmenu(doc, row, command.submenu, menu, close, panelBounds);
  }

  if (command.panel) {
    row.addEventListener("click", () => openCommandPanel(doc, command, menu, close, panelBounds));
    return row;
  }

  const run = command.run;
  row.addEventListener("click", () => {
    run?.();
    close();
  });
  return row;
}

/** A command button and themed checkbox presented as one menu row without nesting controls. */
function renderCheckboxCommand(
  doc: Document,
  row: HTMLButtonElement,
  command: ItemContextMenuCommand,
  menu: HTMLElement,
  close: () => void,
  panelBounds?: () => Element | null,
): HTMLElement {
  const checkbox = command.checkbox!;
  const wrapper = doc.createElement("div");
  wrapper.className = "awesomeado-item-menu__checkbox-command";
  wrapper.style.cssText = [
    "display:flex",
    "align-items:center",
    "width:100%",
    "box-sizing:border-box",
    "border-radius:6px",
    "background:transparent",
  ].join(";");
  wrapper.addEventListener("mouseenter", () => {
    wrapper.style.background = ROW_HOVER_BACKGROUND;
  });
  wrapper.addEventListener("mouseleave", () => {
    wrapper.style.background = "transparent";
  });
  row.style.flex = "1 1 auto";
  row.style.width = "auto";

  const label = doc.createElement("label");
  label.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:5px",
    "padding:6px 10px 6px 4px",
    "font-size:12px",
    "white-space:nowrap",
    "cursor:pointer",
  ].join(";");
  const input = doc.createElement("input");
  input.type = "checkbox";
  input.className = "awesomeado-item-menu__checkbox";
  input.checked = checkbox.checked ?? false;
  input.disabled = checkbox.disabledReason !== null && checkbox.disabledReason !== undefined;
  if (checkbox.disabledReason) label.title = checkbox.disabledReason;
  input.addEventListener("change", () => checkbox.onChange(input.checked));
  label.append(renderCheckboxControl(doc, input), doc.createTextNode(checkbox.label));

  row.addEventListener("click", () => {
    if (input.checked && command.panel !== undefined) {
      openCommandPanel(doc, command, menu, close, panelBounds);
    } else {
      command.run?.();
      close();
    }
  });
  wrapper.append(row, label);
  return wrapper;
}

function openCommandPanel(
  doc: Document,
  command: ItemContextMenuCommand,
  menu: HTMLElement,
  close: () => void,
  panelBounds?: () => Element | null,
): void {
  const panel = command.panel;
  if (panel === undefined) return;
  // The menu owns the inset so every editor aligns with the command rows it replaces.
  const surface = doc.createElement("div");
  surface.className = "awesomeado-item-menu__panel";
  surface.style.cssText = [
    "position:relative",
    `padding:${MENU_PADDING_PX}px ${MENU_PADDING_PX + 2}px`,
  ].join(";");
  const panelElement = panel(close);
  surface.append(panelElement);
  if (command.maximizablePanel) {
    surface.append(renderPanelMaximizeButton(doc, menu, surface, panelElement, panelBounds));
  }
  menu.replaceChildren(surface);
  if (command.centerPanel) centerInWindow(menu);
  else keepPanelInView(menu, doc);
}

/** Keep the box visually stable while the theme-owned green tick alone reports completion. */
function renderCheckboxControl(doc: Document, input: HTMLInputElement): HTMLElement {
  const control = doc.createElement("span");
  control.className = "awesomeado-item-menu__checkbox-control";
  control.style.cssText = [
    "position:relative",
    "display:inline-flex",
    "flex:0 0 14px",
    "width:14px",
    "height:14px",
  ].join(";");

  const box = doc.createElement("span");
  box.className = "awesomeado-item-menu__checkbox-box";
  box.style.cssText = [
    "position:absolute",
    "inset:0",
    "box-sizing:border-box",
    `border:${MENU_BORDER}`,
    "border-radius:3px",
    "background:var(--control-background-muted)",
    "pointer-events:none",
  ].join(";");
  const tick = doc.createElement("span");
  tick.className = "awesomeado-item-menu__checkbox-tick";
  tick.textContent = "\u2713";
  tick.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:50%",
    "color:var(--completion-foreground)",
    "font-size:14px",
    "font-weight:800",
    "line-height:1",
    "transform:translate(-50%,-52%)",
    "pointer-events:none",
  ].join(";");
  const paint = (): void => {
    tick.style.visibility = input.checked ? "visible" : "hidden";
  };

  input.style.cssText = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:100%",
    "margin:0",
    "opacity:0",
    "outline:none",
    `cursor:${input.disabled ? "default" : "pointer"}`,
  ].join(";");
  input.addEventListener("change", paint);
  if (input.disabled) control.style.opacity = "0.55";
  paint();
  control.append(box, tick, input);
  return control;
}

interface PanelStyleSnapshot {
  menu: string;
  surface: string;
  panel: string;
}

/** Adds the viewport-size toggle while retaining the panel's exact original geometry for restore. */
function renderPanelMaximizeButton(
  doc: Document,
  menu: HTMLElement,
  surface: HTMLElement,
  panel: HTMLElement,
  panelBounds?: () => Element | null,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "awesomeado-item-menu__maximize-panel";
  button.style.cssText = [
    "position:absolute",
    `top:${MENU_PADDING_PX}px`,
    `right:${MENU_PADDING_PX + 32}px`,
    "width:24px",
    "height:24px",
    "padding:0",
    "border:0",
    "background:none",
    "color:var(--text-primary-color)",
    "font-size:18px",
    "line-height:18px",
    "cursor:pointer",
  ].join(";");

  let restoreStyles: PanelStyleSnapshot | null = null;
  const showMaximize = (): void => {
    button.setAttribute("aria-label", "Maximize panel");
    button.setAttribute("aria-pressed", "false");
    button.title = "Maximize";
    button.replaceChildren(renderPanelSizeIcon(doc, false));
  };
  const showRestore = (): void => {
    button.setAttribute("aria-label", "Restore panel");
    button.setAttribute("aria-pressed", "true");
    button.title = "Restore";
    button.replaceChildren(renderPanelSizeIcon(doc, true));
  };

  showMaximize();
  button.addEventListener("click", () => {
    if (restoreStyles) {
      menu.style.cssText = restoreStyles.menu;
      surface.style.cssText = restoreStyles.surface;
      panel.style.cssText = restoreStyles.panel;
      restoreStyles = null;
      showMaximize();
      return;
    }

    restoreStyles = {
      menu: menu.style.cssText,
      surface: surface.style.cssText,
      panel: panel.style.cssText,
    };
    maximizePanel(doc, menu, surface, panel, panelBounds?.());
    showRestore();
  });
  return button;
}

/** Draw one window for maximize or two overlapping windows for the familiar restore affordance. */
function renderPanelSizeIcon(doc: Document, restore: boolean): HTMLElement {
  const icon = doc.createElement("span");
  icon.className = "awesomeado-item-menu__panel-size-icon";
  icon.style.cssText = [
    "position:relative",
    "display:inline-block",
    "width:14px",
    "height:14px",
    "vertical-align:middle",
    "pointer-events:none",
  ].join(";");

  const addWindow = (declarations: string[]): void => {
    const windowOutline = doc.createElement("span");
    windowOutline.className = "awesomeado-item-menu__window-outline";
    windowOutline.style.cssText = [
      "position:absolute",
      "box-sizing:border-box",
      "border:1.5px solid currentColor",
      ...declarations,
    ].join(";");
    icon.append(windowOutline);
  };

  if (restore) {
    addWindow(["top:1px", "right:1px", "width:9px", "height:9px"]);
    addWindow([
      "left:1px",
      "bottom:1px",
      "width:9px",
      "height:9px",
      "background:var(--callout-background-color)",
    ]);
  } else {
    addWindow(["inset:2px"]);
  }
  return icon;
}

interface PanelEdges {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Read the viewport dimensions across browsers and jsdom's zero-sized document element. */
function viewportSize(doc: Document): { width: number; height: number } {
  return {
    width: doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0,
    height: doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0,
  };
}

/** Resolve fixed-position offsets from the live surface, falling back to the whole viewport. */
function maximizedPanelEdges(doc: Document, boundsElement: Element | null): PanelEdges {
  const bounds = boundsElement?.getBoundingClientRect();
  if (bounds === undefined || bounds.width <= 0 || bounds.height <= 0) {
    return {
      top: MAXIMIZED_PANEL_MARGIN_PX,
      left: MAXIMIZED_PANEL_MARGIN_PX,
      right: MAXIMIZED_PANEL_MARGIN_PX,
      bottom: MAXIMIZED_PANEL_MARGIN_PX,
    };
  }
  const viewport = viewportSize(doc);
  return {
    top: Math.round(Math.max(0, bounds.top)) + MAXIMIZED_PANEL_MARGIN_PX,
    left: Math.round(Math.max(0, bounds.left)) + MAXIMIZED_PANEL_MARGIN_PX,
    right: Math.round(Math.max(0, viewport.width - bounds.right)) + MAXIMIZED_PANEL_MARGIN_PX,
    bottom: Math.round(Math.max(0, viewport.height - bounds.bottom)) + MAXIMIZED_PANEL_MARGIN_PX,
  };
}

/** Stretch all panel layers inside the owning view while leaving ADO's bars uncovered. */
function maximizePanel(
  doc: Document,
  menu: HTMLElement,
  surface: HTMLElement,
  panel: HTMLElement,
  boundsElement: Element | null = null,
): void {
  const edges = maximizedPanelEdges(doc, boundsElement);

  menu.style.position = "fixed";
  menu.style.top = `${edges.top}px`;
  menu.style.left = `${edges.left}px`;
  menu.style.right = `${edges.right}px`;
  menu.style.bottom = `${edges.bottom}px`;
  menu.style.margin = "0";
  menu.style.transform = "none";
  menu.style.width = "auto";
  menu.style.maxWidth = "none";
  menu.style.boxSizing = "border-box";
  surface.style.height = "100%";
  surface.style.boxSizing = "border-box";
  panel.style.width = "100%";
  panel.style.maxWidth = "none";
  panel.style.height = "100%";
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
  panelBounds?: () => Element | null,
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
      "background:var(--callout-background-color)",
      `border:${MENU_BORDER}`,
      `border-radius:${MENU_RADIUS_PX}px`,
      "box-shadow:0 2px 8px var(--shadow-subtle)",
      "min-width:160px",
      // Same reason as the menu itself: a flyout of sprint labels is far wider than its floor.
      "width:max-content",
      "max-height:320px",
      "overflow-y:auto",
      `padding:${MENU_PADDING_PX}px`,
      "z-index:1",
    ].join(";");
    for (const nested of build()) {
      flyout.append(renderCustomCommand(doc, nested, menu, close, panelBounds));
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
  const { doc, mountInto, logger, panelBounds } = options;

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
      buildPopup: (dismiss) => buildMenu(doc, target, dismiss, logger, panelBounds),
    });
    host.toggle();
  };

  return { openAt, close };
}
