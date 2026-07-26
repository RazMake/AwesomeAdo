import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import type { TrackedUser } from "../../../ado/TrackedWorkItem";
import { renderAssignedTo } from "../AssignedTo/AssignedTo";
import { createPopupHost } from "../popupHost/popupHost";

/**
 * One child work item summarized by the badge and rendered as a popup row.
 *
 * The badge stays domain-agnostic: the caller resolves each child's type color, type icon, ADO deep
 * link, and ETA control, so the control never has to know how a work item maps to a URL, a theme, or
 * a persisted date field.
 */
export interface ChildItemDescriptor {
  /** The child's assignee; null means unassigned. Fed to the shared AssignedTo control. */
  assignedTo: TrackedUser | null;
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
  /** The child's type icon URL, shown as the open-in-ADO affordance; null falls back to a glyph. */
  iconUrl: string | null;
  /** The ADO web URL that opens this item; null renders the affordance inert. */
  url: string | null;
  /** Called when this child's assignee is changed from its picker. */
  onAssigneeChange?: (user: DirectoryUser) => void;
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
  /** The user directory forwarded to each child row's AssignedTo picker. */
  userDirectory: IUserDirectory;
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
 * row — the shared AssignedTo picker, the child's title in its type color, its ETA, and a type-icon
 * link that opens the item in Azure DevOps in a new tab. The popup closes on an outside click, a
 * second badge click, or Escape. Theme-aware via ADO CSS custom properties; renders nothing
 * meaningful when there are no children (the caller decides whether to show it at all).
 */
export function renderChildItemsBadge(doc: Document, options: ChildItemsBadgeOptions): HTMLElement {
  const { children, completedCount, userDirectory, color } = options;

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
    buildPopup: () => buildPopup(doc, children, userDirectory),
  });

  return root;
}

/**
 * Builds the popup shell and fills it with one row per child. Extracted so the render function stays
 * focused on the badge itself and its open/close lifecycle.
 */
function buildPopup(
  doc: Document,
  children: ChildItemDescriptor[],
  userDirectory: IUserDirectory,
): HTMLElement {
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
    "max-width:420px",
    "max-height:320px",
    "overflow-y:auto",
    "padding:4px 0",
    "z-index:1000",
  ].join(";");

  children.forEach((child) => {
    popup.append(renderChildRow(doc, child, userDirectory));
  });

  return popup;
}

/**
 * Renders one child row: the shared AssignedTo picker, the title in its type color, the caller's ETA
 * control, and a type-icon link that opens the item in ADO.
 */
function renderChildRow(
  doc: Document,
  child: ChildItemDescriptor,
  userDirectory: IUserDirectory,
): HTMLElement {
  const row = doc.createElement("div");
  row.className = "awesomeado-child-items__row";
  row.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:4px 8px",
    "white-space:nowrap",
  ].join(";");

  // Reuse the SAME assignee control the main tree uses so the two behave identically.
  const assignedEl = renderAssignedTo(doc, {
    user: child.assignedTo,
    userDirectory,
    onChange: child.onAssigneeChange,
  });
  assignedEl.style.flex = "0 0 auto";

  const title = doc.createElement("span");
  title.className = "awesomeado-child-items__title";
  title.textContent = child.title;
  title.style.cssText = [
    "flex:1 1 auto",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "font-weight:500",
  ].join(";");
  if (child.titleColor) {
    title.style.color = child.titleColor;
  }

  row.append(assignedEl, title);

  if (child.eta) {
    // The title grows, so the ETA lands hard against the open affordance at the row's right edge —
    // the same right-aligned reading order the tree rows use.
    child.eta.classList.add("awesomeado-child-items__eta");
    child.eta.style.flex = "0 0 auto";
    child.eta.style.whiteSpace = "nowrap";
    row.append(child.eta);
  }

  row.append(renderOpenAffordance(doc, child));
  return row;
}

/**
 * Renders the open-in-ADO affordance: the type icon (or a fallback glyph) inside a link that opens
 * the item in a new tab. When the child has no URL the affordance is a plain, inert glyph so the row
 * still lines up.
 */
function renderOpenAffordance(doc: Document, child: ChildItemDescriptor): HTMLElement {
  const glyph = (): HTMLElement => {
    if (child.iconUrl) {
      const icon = doc.createElement("img");
      icon.className = "awesomeado-child-items__icon";
      icon.src = child.iconUrl;
      icon.alt = "";
      icon.width = 14;
      icon.height = 14;
      icon.style.cssText = ["display:block", "width:14px", "height:14px"].join(";");
      return icon;
    }
    // No type icon supplied → a neutral "open" glyph so the affordance is still present.
    const fallback = doc.createElement("span");
    fallback.className = "awesomeado-child-items__icon";
    fallback.textContent = "\u2197"; // ↗
    fallback.style.cssText = "font-size:12px;line-height:1";
    return fallback;
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
