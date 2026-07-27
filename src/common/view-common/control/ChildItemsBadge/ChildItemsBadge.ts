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
}

/** Options for rendering a child-items badge. */
export interface ChildItemsBadgeOptions {
  /** The direct children summarized by the badge and listed in its popup. */
  children: ChildItemDescriptor[];
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
 * Titles wrap, so the assignee, ETA, and open affordance are centered inside a box exactly one line
 * tall and pinned to the top of the row. Left to the flex default they would center against the
 * whole wrapped block and drift away from the title line they annotate.
 */
const TITLE_LINE_HEIGHT_PX = 20;

/** The neutral themed chip used when no usable color is supplied. */
const NEUTRAL_TINT = {
  background: "var(--palette-neutral-4, rgba(128,128,128,0.12))",
  borderColor: "var(--palette-neutral-20, #ddd)",
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
 * row — the shared AssignedTo picker, the child's title in its type color, its ETA, and a link glyph
 * that opens the item in Azure DevOps in a new tab. The popup closes on an outside click, a second
 * badge click, or Escape. Theme-aware via ADO CSS custom properties; renders nothing meaningful when
 * there are no children (the caller decides whether to show it at all).
 */
export function renderChildItemsBadge(doc: Document, options: ChildItemsBadgeOptions): HTMLElement {
  const { children, completedCount, color } = options;

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
    "color:var(--text-primary-color, #323130)",
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
  createPopupHost({
    doc,
    trigger: badge,
    mountInto: root,
    buildPopup: () => buildPopup(doc, children),
  });

  return root;
}

/**
 * Builds the popup shell and fills it with one row per child. Extracted so the render function stays
 * focused on the badge itself and its open/close lifecycle.
 */
function buildPopup(doc: Document, children: ChildItemDescriptor[]): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-child-items__popup";
  // Theme-aware colors: ADO custom properties with fallbacks.
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    "min-width:240px",
    // Titles wrap rather than truncate, so the popup is given a materially bigger envelope than the
    // one-line-per-child layout needed: more width means fewer wrapped lines, more height means more
    // children stay visible before the list has to scroll.
    "max-width:588px",
    "max-height:448px",
    "overflow-y:auto",
    "padding:4px 0",
    "z-index:1000",
  ].join(";");

  children.forEach((child) => {
    popup.append(renderChildRow(doc, child));
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
 * Renders one child row: the caller's assignee picker, the title in its type color, the caller's ETA
 * control, and a link glyph that opens the item in ADO.
 */
function renderChildRow(doc: Document, child: ChildItemDescriptor): HTMLElement {
  const row = doc.createElement("div");
  row.className = "awesomeado-child-items__row";
  row.style.cssText = [
    "display:flex",
    // Top-aligned so the side controls keep their line-one anchoring under a wrapped title.
    "align-items:flex-start",
    "gap:8px",
    "padding:4px 8px",
  ].join(";");

  if (child.assignee) {
    row.append(firstLineSlot(doc, child.assignee));
  }

  const title = doc.createElement("span");
  title.className = "awesomeado-child-items__title";
  title.textContent = child.title;
  title.style.cssText = [
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
    title.style.color = child.titleColor;
  }

  row.append(title);

  if (child.eta) {
    // The title grows, so the ETA lands hard against the open affordance at the row's right edge —
    // the same right-aligned reading order the tree rows use.
    child.eta.classList.add("awesomeado-child-items__eta");
    row.append(firstLineSlot(doc, child.eta));
  }

  row.append(firstLineSlot(doc, renderOpenAffordance(doc, child)));
  return row;
}

/**
 * Builds the chain-link glyph that marks the open-in-ADO affordance.
 *
 * A link glyph — not the child's type icon — because the affordance's job is "this opens the item
 * elsewhere"; the type is already carried by the title's color, so repeating it here said nothing
 * about what clicking would do. Drawn inline in `currentColor` so it inherits the row's text color
 * on every ADO theme without a second style pass or a network fetch.
 */
function buildLinkIcon(doc: Document): SVGSVGElement {
  const svg = createSvgCanvas(doc, "display:block");

  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  // Two half-links joined by a diagonal bar: the upper-right half hooks out of the bar's top end and
  // the lower-left half out of its bottom end.
  path.setAttribute(
    "d",
    "M6.3 9.7 L9.7 6.3 M9.3 4.5 L10.7 3.1 a2.7 2.7 0 0 1 3.8 3.8 L13.1 8.3 M6.7 11.5 L5.3 12.9 a2.7 2.7 0 0 1-3.8-3.8 L2.9 7.7",
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
 * tab. When the child has no URL the affordance is a plain, inert glyph so the row still lines up.
 */
function renderOpenAffordance(doc: Document, child: ChildItemDescriptor): HTMLElement {
  const glyph = (): HTMLElement => {
    const icon = doc.createElement("span");
    icon.className = "awesomeado-child-items__icon";
    icon.style.cssText = ["display:inline-flex", "align-items:center"].join(";");
    icon.append(buildLinkIcon(doc));
    return icon;
  };

  if (!child.url) {
    const inert = doc.createElement("span");
    inert.style.cssText = ["flex:0 0 auto", "opacity:0.5"].join(";");
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
  link.style.cssText = ["flex:0 0 auto", "display:inline-flex", "align-items:center"].join(";");
  link.append(glyph());
  return link;
}
