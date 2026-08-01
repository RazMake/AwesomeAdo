import { createPopupHost } from "../popupHost/popupHost";
import { createSvgCanvas } from "../svgIcon/svgIcon";

/**
 * One child work item summarized by the badge and rendered as a popup row.
 *
 * The badge stays domain-agnostic: the caller resolves each child's type color, ADO deep link, and
 * the assignee and ETA controls, so the control never has to know how a work item maps to a URL, a
 * theme, or a persisted field.
 */
export interface ChildItemDescriptor {
  /**
   * The child's assignee control, built by the caller (typically the shared `AssignedTo`) so the
   * write path — which item to reassign, and the queue that serializes it — stays with the owning
   * view; null renders no assignee for that row.
   */
  assignee: HTMLElement | null;
  /**
   * Whether the child is finished. Drives the row's checkbox tick and strikes its title through, so
   * the list answers "what is left?" by shape alone. Which board column counts as finished is the
   * caller's decision, so the answer is passed in rather than inferred from anything here.
   */
  done: boolean;
  /**
   * Persists a completion toggle, resolving with the state that ACTUALLY committed — so a rejected
   * write leaves the tick exactly where the server still has it instead of showing a change nobody
   * accepted. Omitted leaves the checkbox a read-only indicator (no pointer, no click), which is the
   * honest rendering when the caller has no state to write to.
   */
  onToggleDone?: (done: boolean) => Promise<boolean>;
  /** The child's title. */
  title: string;
  /** The child's type color (hex, WITH a leading `#`); null uses the theme's primary text color. */
  titleColor: string | null;
  /**
   * The child's ETA control, built by the caller (typically the shared `EtaBadge`) so the write path
   * — which field to persist to, and the queue that serializes it — stays with the owning view;
   * null renders no ETA for that row.
   */
  eta: HTMLElement | null;
  /** The ADO web URL that opens this item; null renders the affordance inert. */
  url: string | null;
  /**
   * Called when the row is right-clicked, so the owning view can offer the same per-item menu here
   * as on a tree row. The badge stays menu-agnostic: it reports the gesture and the caller decides
   * what (if anything) it opens. Omitted leaves the browser's own menu alone.
   */
  onContextMenu?: (event: MouseEvent) => void;
  /**
   * Called after the popup row is assembled, so the owning view may add domain-specific behavior
   * such as drag-to-reorder without putting work-item identity or persistence into this control.
   */
  onRowReady?: (
    row: HTMLElement,
    title: HTMLElement,
    dragContext: { surface: HTMLElement; close: () => void },
  ) => void;
}

/** Options for rendering a child-items badge. */
export interface ChildItemsBadgeOptions {
  /** The direct children summarized by the badge and listed in its popup. */
  children: ChildItemDescriptor[];
  /** Whether the popup opens immediately when the badge is rendered. Defaults to false. */
  initiallyOpen?: boolean;
  /** Reports popup open/close changes so an owning draggable surface can suspend its drag handle. */
  onOpenChange?: (open: boolean) => void;
  /**
   * How many of `children` are completed (the numerator of "completed / total"). Completion is a
   * board-column decision the caller owns, so it is passed in rather than derived here.
   */
  completedCount: number;
  /**
   * The color the badge's discrete tint derives from (hex, with or without a leading `#`) — normally
   * the work item type of the children it summarizes. Omitted, null, or unparseable falls back to a
   * neutral themed chip, so a type with no configured color still renders.
   */
  color?: string | null;
}

/** The alpha the badge fill and border use so any source hue stays discrete on every ADO theme. */
const TINT_FILL_ALPHA = 0.12;
const TINT_BORDER_ALPHA = 0.35;

/**
 * The height of a single title line in a popup row.
 *
 * Titles wrap, so the checkbox, assignee and ETA are centered inside a box exactly one line tall and
 * pinned to the top of the row. Left to the flex default they would center against the whole wrapped
 * block and drift away from the title line they annotate.
 */
const TITLE_LINE_HEIGHT_PX = 20;

/** The popup's corner radius; its rows are rounded a little less so they nest inside it. */
const POPUP_RADIUS_PX = 10;
const ROW_RADIUS_PX = 8;

/**
 * How much of the viewport's width the popup leaves free.
 *
 * The popup sizes itself from its content, so this cap is the ONLY thing that ever forces a title to
 * wrap: below it the list lays one child per line, which is what makes it scannable. Enough is left
 * over to clear the host's own edge margin and a scroll container's scrollbar, so the widest row
 * still lands fully on screen after the host slides the popup back inside the visible area.
 */
const VIEWPORT_INSET_PX = 24;

/**
 * The checkbox box: its edge length and the frame drawn around the tick.
 *
 * Dedicated control roles keep the frame and fill distinct from the popup surface, including when
 * Follow ADO supplies neutral palette values that otherwise collapse into that surface.
 */
const CHECKBOX_SIZE_PX = 18;
const CHECKBOX_BORDER_PX = 1.5;
const CHECKBOX_BORDER_COLOR = "var(--control-border-emphasis)";
const CHECKBOX_FILL = "var(--control-background-muted)";

/**
 * The tick: a check drawn as two borders of a flattened box rotated onto its corner, so it needs no
 * glyph asset. Sized to read at a glance from across the list while still clearing the box's frame —
 * rotation costs a factor of √2, so the arms stay well inside the box's inner edge.
 */
const TICK_ARM_PX = 5.5;
const TICK_STEM_PX = 10.5;
const TICK_STROKE_PX = 3;

/**
 * The wash a row takes on hover, and the tick's color.
 *
 * The tick is the one place a hue carries meaning rather than decoration, so it is not left to
 * `currentColor`: green reads as "finished" at a glance even when the struck-through title beside it
 * has been dimmed.
 *
 * A dedicated completion role keeps the narrow stroke legible on each concrete theme.
 */
const ROW_HOVER_BACKGROUND = "var(--palette-neutral-4)";
const TICK_COLOR = "var(--completion-foreground)";

/** The neutral themed chip used when no usable color is supplied. */
const NEUTRAL_TINT = {
  background: "var(--palette-neutral-4)",
  borderColor: "var(--palette-neutral-20)",
} as const;

/**
 * Resolve the badge's fill and border from a source hex color.
 *
 * The hue is rendered at a very low alpha rather than at full strength so the badge reads as a quiet
 * progress hint next to the far louder status badge, and so the same tint sits legibly on light,
 * dark, and Follow-ADO themes without being re-picked per theme.
 */
function tintFromColor(color: string | null | undefined): {
  background: string;
  borderColor: string;
} {
  const hex = (color ?? "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { ...NEUTRAL_TINT };
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return {
    background: `rgba(${r},${g},${b},${TINT_FILL_ALPHA})`,
    borderColor: `rgba(${r},${g},${b},${TINT_BORDER_ALPHA})`,
  };
}

/**
 * A "completed / total" badge for an item's direct children, tinted from their work item type.
 *
 * Shows e.g. `2 / 3` (2 of 3 children completed). Clicking toggles a popup listing every child as a
 * row — a completion checkbox, the shared AssignedTo picker, the child's title in its type color
 * (struck through once finished) trailed by a glyph that opens the item in Azure DevOps in a new
 * tab, and its ETA. The popup closes on an outside click, a second badge click, or Escape.
 * Theme-aware via ADO CSS custom properties; renders nothing meaningful when there are no children
 * (the caller decides whether to show it at all).
 */
export function renderChildItemsBadge(doc: Document, options: ChildItemsBadgeOptions): HTMLElement {
  const { children, completedCount, color, initiallyOpen = false, onOpenChange } = options;

  // Root container: position:relative so the popup anchors to it.
  const root = doc.createElement("span");
  root.className = "awesomeado-child-items";
  root.style.cssText = ["position:relative", "display:inline-flex", "align-items:center"].join(";");

  // The badge chip: "completed / total" in a discrete tint of the summarized children's type color,
  // so it reads as a subtle progress hint that still belongs to that type at a glance.
  const tint = tintFromColor(color);
  const badge = doc.createElement("button");
  badge.className = "awesomeado-child-items__badge";
  badge.type = "button";
  badge.textContent = `${completedCount} / ${children.length}`;
  badge.style.cssText = [
    "cursor:pointer",
    `border:1px solid ${tint.borderColor}`,
    `background:${tint.background}`,
    "color:var(--text-primary-color)",
    "border-radius:3px",
    "padding:3px 8px",
    "font:inherit",
    "font-size:11px",
    "line-height:1",
    "white-space:nowrap",
  ].join(";");

  root.append(badge);

  // The popup lifecycle (open/close, outside-click and Escape dismissal) is owned by the shared host
  // so it is not reimplemented per control; the badge is both the trigger and the anchor.
  const popupHost = createPopupHost({
    doc,
    trigger: badge,
    mountInto: root,
    buildPopup: (close) => buildPopup(doc, children, close),
    onOpened: () => onOpenChange?.(true),
    onClosed: () => onOpenChange?.(false),
  });
  if (initiallyOpen) {
    // A reorder rebuilds the board while this control is detached. Opening synchronously gives the
    // popup host a zero-size box, so it cannot restore the viewport-aware alignment used on the
    // first click and leaves the popup pinned to the chip's top-left corner instead.
    queueMicrotask(() => {
      if (root.isConnected && !popupHost.isOpen) {
        popupHost.toggle();
      }
    });
  }

  return root;
}

/**
 * Builds the popup shell and fills it with one row per child. Extracted so the render function stays
 * focused on the badge itself and its open/close lifecycle.
 */
function buildPopup(
  doc: Document,
  children: ChildItemDescriptor[],
  close: () => void,
): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-child-items__popup";
  // Theme-aware colors come from the complete palette pinned by the extension host.
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color)",
    "border:1px solid var(--palette-neutral-20)",
    `border-radius:${POPUP_RADIUS_PX}px`,
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "min-width:240px",
    // Sized from its own content, NOT left to shrink-to-fit. The popup is absolutely positioned
    // inside the badge's root, so "available width" is that root's ~30px box: the popup collapsed
    // onto its 240px floor and squeezed the title column down to a few pixels, wrapping titles one
    // CHARACTER per line. `max-content` takes the width the rows actually want, which a `max-width`
    // alone could never restore, and the viewport cap is then the only thing that forces a wrap.
    "width:max-content",
    `max-width:calc(100vw - ${VIEWPORT_INSET_PX}px)`,
    "max-height:448px",
    "overflow-y:auto",
    // The inset matches the row corner radius, so a hovered row's rounded highlight sits inside the
    // popup's own rounded edge instead of colliding with it.
    `padding:${ROW_RADIUS_PX}px`,
    "z-index:1000",
  ].join(";");

  children.forEach((child) => {
    popup.append(renderChildRow(doc, child, { surface: popup, close }));
  });

  return popup;
}

/**
 * Wraps a row's side control in a box one title line tall so it stays optically centered on the
 * FIRST line of a title that wraps, instead of on the middle of the wrapped block.
 */
function firstLineSlot(doc: Document, content: HTMLElement): HTMLElement {
  const slot = doc.createElement("span");
  slot.className = "awesomeado-child-items__slot";
  slot.style.cssText = [
    "flex:0 0 auto",
    "display:inline-flex",
    "align-items:center",
    `min-height:${TITLE_LINE_HEIGHT_PX}px`,
    "white-space:nowrap",
  ].join(";");
  slot.append(content);
  return slot;
}

/**
 * Renders one child row: a completion checkbox, the caller's assignee picker, the title in its type
 * color (trailed by the glyph that opens the item in ADO), and the caller's ETA control.
 */
function renderChildRow(
  doc: Document,
  child: ChildItemDescriptor,
  dragContext: { surface: HTMLElement; close: () => void },
): HTMLElement {
  const row = doc.createElement("div");
  row.className = "awesomeado-child-items__row";
  row.style.cssText = [
    "display:flex",
    // Top-aligned so the side controls keep their line-one anchoring under a wrapped title.
    "align-items:flex-start",
    "gap:10px",
    "padding:7px 10px",
    `border-radius:${ROW_RADIUS_PX}px`,
  ].join(";");
  // Hovering a row marks which one the checkbox, assignee and ETA under the pointer belong to; on a
  // dense list that is the only thing tying four separate controls to a single child.
  row.addEventListener("mouseenter", () => {
    row.style.backgroundColor = ROW_HOVER_BACKGROUND;
  });
  row.addEventListener("mouseleave", () => {
    row.style.backgroundColor = "";
  });
  if (child.onContextMenu) {
    const onContextMenu = child.onContextMenu;
    row.addEventListener("contextmenu", (event) => onContextMenu(event));
  }

  const title = renderChildTitle(doc, child);
  row.append(firstLineSlot(doc, renderDoneCheckbox(doc, child, row, title)));

  if (child.assignee) {
    row.append(firstLineSlot(doc, child.assignee));
  }

  row.append(title.element);

  if (child.eta) {
    // The title grows, so the ETA is pushed to the row's right edge — the same right-aligned reading
    // order the tree rows use.
    child.eta.classList.add("awesomeado-child-items__eta");
    row.append(firstLineSlot(doc, child.eta));
  }

  child.onRowReady?.(row, title.element, dragContext);

  return row;
}

/** A row's title: the element that lays it out, and the span carrying the text itself. */
interface ChildTitle {
  element: HTMLElement;
  text: HTMLElement;
}

/**
 * Builds the row's title — the text in the child's type color, trailed inline by the open-in-ADO
 * glyph.
 *
 * The glyph lives INSIDE the title rather than in a column of its own so it follows the last word of
 * a wrapped title instead of floating beside the first line, which is where the affordance belongs:
 * it opens that title. Being inside is also what gives it the title's own color for free.
 *
 * The text gets its own span so completion can strike THROUGH THE WORDS without dragging a line
 * across the glyph beside them.
 */
function renderChildTitle(doc: Document, child: ChildItemDescriptor): ChildTitle {
  const element = doc.createElement("span");
  element.className = "awesomeado-child-items__title";
  element.style.cssText = [
    "flex:1 1 auto",
    "min-width:0",
    // The popup is the only place a rolled-up child's title is readable, and truncation hides exactly
    // the trailing words that distinguish sibling children — so wrap instead of clipping, breaking
    // mid-token only when a single unbroken word would otherwise overflow.
    "white-space:normal",
    "overflow-wrap:anywhere",
    `line-height:${TITLE_LINE_HEIGHT_PX}px`,
    "font-weight:500",
  ].join(";");
  if (child.titleColor) {
    element.style.color = child.titleColor;
  }

  const text = doc.createElement("span");
  text.className = "awesomeado-child-items__title-text";
  text.textContent = child.title;

  element.append(text, renderOpenAffordance(doc, child));
  return { element, text };
}

/** How far a finished child's title recedes, so the list reads as "what is still open?". */
const DONE_TITLE_OPACITY = "0.6";

/** Reflects a child's completion on its checkbox and title in one place, so the two cannot disagree. */
function applyDone(
  checkbox: HTMLElement,
  tick: HTMLElement,
  title: ChildTitle,
  done: boolean,
): void {
  checkbox.setAttribute("aria-checked", done ? "true" : "false");
  tick.style.visibility = done ? "visible" : "hidden";
  // Struck on the words only; the whole title (glyph included) recedes together via its opacity.
  title.text.style.textDecoration = done ? "line-through" : "none";
  title.element.style.opacity = done ? DONE_TITLE_OPACITY : "1";
}

/**
 * Builds the row's completion checkbox: ticked when the child is finished, and — when the caller
 * supplied a writer — clickable to finish or reopen it.
 *
 * Persist-then-reflect, like every other editable control here: the row is held busy for the width
 * of the write and only takes the state the caller reports as committed, so a rejected write can
 * never leave a tick on screen that ADO did not accept.
 */
function renderDoneCheckbox(
  doc: Document,
  child: ChildItemDescriptor,
  row: HTMLElement,
  title: ChildTitle,
): HTMLElement {
  const checkbox = doc.createElement("button");
  checkbox.className = "awesomeado-child-items__check";
  checkbox.type = "button";
  checkbox.setAttribute("role", "checkbox");
  const interactive = child.onToggleDone !== undefined;
  checkbox.disabled = !interactive;
  checkbox.title = interactive ? (child.done ? "Reopen" : "Mark complete") : "";
  checkbox.style.cssText = [
    "flex:0 0 auto",
    "box-sizing:border-box",
    `width:${CHECKBOX_SIZE_PX}px`,
    `height:${CHECKBOX_SIZE_PX}px`,
    "padding:0",
    "position:relative",
    `border-width:${CHECKBOX_BORDER_PX}px`,
    "border-style:solid",
    `border-color:${CHECKBOX_BORDER_COLOR}`,
    "border-radius:4px",
    `background:${CHECKBOX_FILL}`,
    interactive ? "cursor:pointer" : "cursor:default",
  ].join(";");

  // The tick is two borders of a flattened box rotated onto their corner — the same shape the
  // reference view draws — so it needs no glyph asset and scales with the box it sits in.
  const tick = doc.createElement("span");
  tick.className = "awesomeado-child-items__tick";
  tick.style.cssText = [
    "position:absolute",
    // Centered by its own size rather than by a pair of hand-tuned offsets, so the tick and the box
    // can be resized independently without re-deriving where the check lands. Nudged fractionally
    // above centre because a check reads low when its geometric centre is used as its optical one.
    "left:50%",
    "top:46%",
    `width:${TICK_ARM_PX}px`,
    `height:${TICK_STEM_PX}px`,
    "border-style:solid",
    `border-color:${TICK_COLOR}`,
    // Overrides the line above where supported; dropped whole where it is not, leaving the fallback.
    `border-width:0 ${TICK_STROKE_PX}px ${TICK_STROKE_PX}px 0`,
    "transform:translate(-50%,-50%) rotate(45deg)",
  ].join(";");
  checkbox.append(tick);

  let done = child.done;
  applyDone(checkbox, tick, title, done);

  if (child.onToggleDone) {
    const toggle = child.onToggleDone;
    checkbox.addEventListener("click", () => {
      if (row.dataset.busy === "true") {
        return;
      }
      row.dataset.busy = "true";
      row.style.opacity = "0.55";
      void toggle(!done).then((committed) => {
        done = committed;
        applyDone(checkbox, tick, title, done);
        checkbox.title = done ? "Reopen" : "Mark complete";
        row.style.opacity = "";
        delete row.dataset.busy;
      });
    });
  }

  return checkbox;
}

/**
 * Builds the "open in a new tab" glyph that marks the open-in-ADO affordance.
 *
 * A box with an arrow leaving it — not the child's type icon — because the affordance's job is "this
 * opens the item elsewhere"; the type is already carried by the title's color, so repeating it here
 * said nothing about what clicking would do. The arrow-out-of-a-box is the shape readers already
 * know from ADO's own deep links, which a chain link (a URL, not a navigation) was not. Drawn inline
 * in `currentColor` so it takes the title's own color — the glyph belongs to that title — on every
 * ADO theme without a second style pass or a network fetch.
 */
function buildLinkIcon(doc: Document): SVGSVGElement {
  const svg = createSvgCanvas(doc, "display:block");

  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  // An open-cornered box (the page you stay on) plus an arrow escaping through the gap in it.
  path.setAttribute(
    "d",
    "M9.5 2 H14 V6.5 M14 2 L8 8 M12 9.5 V13 a1 1 0 0 1-1 1 H3 a1 1 0 0 1-1-1 V5 a1 1 0 0 1 1-1 H6.5",
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.append(path);
  return svg;
}

/**
 * Renders the open-in-ADO affordance: a link glyph inside an anchor that opens the item in a new
 * tab. When the child has no URL the affordance is a plain, inert glyph so the row still reads the
 * same.
 *
 * It trails the title's words inline, so the shared styling is what keeps it on the text baseline
 * and stops the anchor from taking the browser's link blue over the title's type color.
 */
function renderOpenAffordance(doc: Document, child: ChildItemDescriptor): HTMLElement {
  const glyph = (): HTMLElement => {
    const icon = doc.createElement("span");
    icon.className = "awesomeado-child-items__icon";
    icon.style.cssText = ["display:inline-flex", "align-items:center"].join(";");
    icon.append(buildLinkIcon(doc));
    return icon;
  };

  const inlineWithTitle = [
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "margin-left:6px",
    "color:inherit",
    "text-decoration:none",
  ];

  if (!child.url) {
    const inert = doc.createElement("span");
    inert.style.cssText = [...inlineWithTitle, "opacity:0.5"].join(";");
    inert.append(glyph());
    return inert;
  }

  const link = doc.createElement("a");
  link.className = "awesomeado-child-items__open";
  link.href = child.url;
  // Open the item in a new tab; noopener/noreferrer so the opened ADO tab cannot reach back into the
  // extension's page context.
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "Open in Azure DevOps";
  link.style.cssText = inlineWithTitle.join(";");
  link.append(glyph());
  return link;
}
