import { createPopupHost } from "../popupHost/popupHost";

/** A board-column choice in the status dropdown. */
export interface StatusColumnOption {
  /** The board-column label shown to the user (the application state). */
  column: string;
  /** The ADO state written back when this column is chosen (the column's primary state = states[0]). */
  primaryState: string;
  /**
   * Zero-based position of this column in the team's global board-column order. Color is keyed off
   * this position — not the work-item type — so the same board column reads identically for every
   * type. Use a negative value when the column is not part of the configured board order.
   */
  ordinal: number;
}

/** Options for rendering a status badge. */
export interface StatusBadgeOptions {
  /** The current Status label to display — the application state (board-column label), not the raw ADO State. */
  state: string;
  /**
   * Zero-based global board-column position of the current state, driving its color so every type
   * colors the same position identically. Omit or use a negative value for a neutral tint.
   */
  ordinal?: number;
  /** The selectable columns when editable; empty/undefined => the badge is effectively read-only. */
  columns?: StatusColumnOption[];
  /** When true (and columns non-empty) the badge is editable: hand cursor + opens a dropdown on click. */
  editable?: boolean;
  /**
   * A shared minimum content width (in `ch`) so every badge in a view renders one uniform size. The
   * caller passes the widest value the whole board can show; a badge never renders narrower than its
   * own longest label.
   */
  minWidthCh?: number;
  /** Called with the chosen primary ADO state and its column label when the user picks one. Fire immediately (persist-on-select). */
  onChange?: (primaryState: string, column: string) => void;
}

/**
 * A rendered status badge plus the handle its owner uses to reflect a committed status change.
 *
 * The element is returned directly (so callers can append it), augmented with `setStatus`. Color is
 * owned entirely by the control: when the owner commits a move to a new column it calls `setStatus`
 * with the new label and that column's ordinal, and the control re-tints itself — the caller never
 * reaches into the badge's styles, so the position→color mapping stays in one place.
 */
export interface StatusBadgeHandle extends HTMLElement {
  /** Update the displayed status label and re-tint to the given board-column ordinal. */
  setStatus(state: string, ordinal: number | undefined): void;
}

/**
 * Build the dropdown popup listing the columns the badge can move to. Receives `close` so a picked
 * column dismisses the popup immediately (persist-on-select). It reads `currentState` at open time
 * and filters it out — the active state is context, not a possible transition — so after a committed
 * move the list once more offers the column just left and excludes the new one.
 */
function buildStatusPopup(
  doc: Document,
  columns: StatusColumnOption[],
  currentState: string,
  onChange: StatusBadgeOptions["onChange"],
  close: () => void,
): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-status__popup";
  // Theme-aware colors: use ADO custom properties with fallbacks.
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    "min-width:150px",
    "max-width:300px",
    "padding:4px 0",
    "z-index:1000",
  ].join(";");

  columns
    .filter((col) => col.primaryState !== currentState && col.column !== currentState)
    .forEach((col) => {
      const row = doc.createElement("button");
      row.type = "button";
      row.className = "awesomeado-status__row";
      row.textContent = col.column;
      const rowColors = colorsForOrdinal(col.ordinal);
      row.style.cssText = [
        "cursor:pointer",
        `background:${rowColors.background}`,
        `color:${rowColors.textColor}`,
        `border:1px solid ${rowColors.borderColor}`,
        "border-radius:3px",
        "padding:4px 8px",
        "margin:2px 4px",
        "width:calc(100% - 8px)",
        "text-align:left",
        "font:inherit",
        "white-space:nowrap",
      ].join(";");

      row.addEventListener("click", () => {
        onChange?.(col.primaryState, col.column);
        close();
      });

      // Hover highlight uses ADO theme token.
      row.addEventListener("mouseenter", () => {
        row.style.boxShadow = "inset 0 0 0 999px var(--palette-neutral-4, rgba(128,128,128,0.12))";
      });
      row.addEventListener("mouseleave", () => {
        row.style.boxShadow = "none";
      });

      popup.append(row);
    });

  return popup;
}

/**
 * A work-item status badge showing the current ADO state with a muted, position-specific tint.
 *
 * The badge colors the state by its global board-column ordinal (see `colorsForOrdinal`) so the same
 * position reads identically across every work-item type. When editable (and columns are provided),
 * clicking opens a dropdown to change the state; selecting a column calls onChange and closes the
 * popup immediately. Escape and outside clicks dismiss the popup.
 */
export function renderStatusBadge(doc: Document, options: StatusBadgeOptions): StatusBadgeHandle {
  const { state, ordinal, columns = [], editable = false, minWidthCh, onChange } = options;

  const isInteractive = editable && columns.length > 0;

  // The currently-displayed Status. Tracked as mutable state (not just the initial `state` const)
  // because the dropdown is rebuilt every time it opens: after a committed move via `setStatus` the
  // popup must exclude the NEW current column and offer the one just left, so the option list stays
  // correct across repeated changes instead of freezing on the first render's state.
  let currentState = state;

  // Root container: position:relative so the popup can anchor to it.
  const root = doc.createElement("span");
  root.className = "awesomeado-status";
  root.style.cssText = ["position:relative", "display:inline-flex", "align-items:center"].join(";");

  // The badge chip showing the current state.
  const badge = doc.createElement("span");
  badge.className = "awesomeado-status__badge";

  // Apply the position-specific tint. Extracted so a committed status change can re-tint in place
  // (the owner passes the new ordinal) without duplicating the color mapping outside the control.
  const applyColors = (forOrdinal: number | undefined): void => {
    const { background, textColor, borderColor } = colorsForOrdinal(forOrdinal);
    badge.style.background = background;
    badge.style.color = textColor;
    badge.style.border = `1px solid ${borderColor}`;
  };

  // Size every badge to one identical width so the column reads as a clean grid. Base it on the
  // WIDEST value the whole board can show (the caller's shared width), never narrower than this
  // badge's own longest label, and always reserve the dropdown-caret column — even for a read-only
  // badge — so editable and read-only chips line up. A FIXED `width` (not just `min-width`) is used
  // because `ch` counts characters while a proportional font renders them at different pixel widths;
  // pinning the width and clipping overflow keeps every chip the same size regardless of its text.
  const candidateLabels = [state, ...columns.map((col) => col.column)];
  const ownWidestLength = Math.max(...candidateLabels.map((label) => label.length));
  const badgeWidthCh = Math.max(ownWidestLength, minWidthCh ?? 0) + 3;
  badge.style.cssText = [
    `cursor:${isInteractive ? "pointer" : "default"}`,
    "border-radius:3px",
    "padding:3px 8px",
    "font-size:10px",
    "line-height:1",
    `width:${badgeWidthCh}ch`,
    "overflow:hidden",
    "white-space:nowrap",
    "display:inline-flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:4px",
  ].join(";");
  applyColors(ordinal);

  badge.textContent = state;

  // Render a caret affordance when interactive.
  if (isInteractive) {
    const caret = doc.createElement("span");
    caret.textContent = "▾";
    caret.style.cssText = "font-size:9px;opacity:0.7";
    badge.append(caret);
  }

  root.append(badge);

  // The popup lifecycle (toggle on click, outside-click and Escape dismissal) is owned by the shared
  // host; a non-interactive badge is not wired, so it never opens. The dropdown is rebuilt on each
  // open so it always excludes the CURRENT column and offers the one just left after a committed move.
  createPopupHost({
    doc,
    trigger: badge,
    mountInto: root,
    buildPopup: (close) => buildStatusPopup(doc, columns, currentState, onChange, close),
    interactive: isInteractive,
  });

  const handle = root as StatusBadgeHandle;
  handle.setStatus = (newState, newOrdinal) => {
    // Replace only the leading text node so the caret (a later child) is preserved, then re-tint to
    // the new column's ordinal so the chip's color tracks its label after a committed move.
    const textNode = badge.childNodes[0];
    if (textNode) {
      textNode.textContent = newState;
    }
    // Track the new label so the next time the dropdown opens it excludes this column and once more
    // offers the one just left, keeping the choices in step with the committed state.
    currentState = newState;
    applyColors(newOrdinal);
  };
  return handle;
}

/**
 * A discrete badge color keyed by board-column ordinal: an RGB background hue plus an optional
 * same-hue text color for the terminal states.
 */
interface OrdinalColor {
  /** The background hue; rendered as a low-alpha tint so it reads on any ADO theme. */
  rgb: { r: number; g: number; b: number };
  /** Same-hue text color for terminal states, or null to use the theme's primary text. */
  contrastText: string | null;
}

/**
 * Fixed, type-independent colors keyed by a state's ordinal position in the team's global
 * board-column order, so the same position reads identically across every work-item type:
 * 1st gray, 2nd blue, 3rd yellow, 4th green, 5th red. The first three carry the theme's primary
 * text; the terminal green and red states use a brightness-contrasted same-hue text so a "done" or
 * "removed" state stands out at a glance. Backgrounds are discrete low-alpha tints so each hue reads
 * on any theme without fighting the page.
 */
const ORDINAL_COLORS: readonly OrdinalColor[] = [
  { rgb: { r: 128, g: 128, b: 128 }, contrastText: null }, // 1st — gray
  { rgb: { r: 0, g: 120, b: 212 }, contrastText: null }, // 2nd — blue
  { rgb: { r: 224, g: 168, b: 0 }, contrastText: null }, // 3rd — yellow
  { rgb: { r: 16, g: 124, b: 16 }, contrastText: "rgb(30,140,45)" }, // 4th — green
  { rgb: { r: 197, g: 15, b: 31 }, contrastText: "rgb(224,60,60)" }, // 5th — red
];

/** The neutral themed chip used when a state has no known board-column ordinal. */
const NEUTRAL_COLORS = {
  background: "var(--palette-neutral-4, rgba(128,128,128,0.12))",
  textColor: "var(--text-primary-color, #323130)",
  borderColor: "var(--palette-neutral-20, #ddd)",
} as const;

/**
 * Resolve the discrete background, text, and border for a state's global board-column ordinal.
 *
 * An unknown ordinal (undefined or negative — e.g. a raw ADO State that maps to no board column)
 * falls back to a neutral themed chip so it is still shown rather than mis-colored. Positions beyond
 * the fixed five reuse the last (terminal) color so an unusually long workflow still renders.
 */
function colorsForOrdinal(ordinal: number | undefined): {
  background: string;
  textColor: string;
  borderColor: string;
} {
  if (ordinal === undefined || ordinal < 0) {
    return { ...NEUTRAL_COLORS };
  }

  const color = ORDINAL_COLORS[Math.min(ordinal, ORDINAL_COLORS.length - 1)]!;
  const { r, g, b } = color.rgb;
  return {
    background: `rgba(${r},${g},${b},0.2)`,
    textColor: color.contrastText ?? "var(--text-primary-color, #323130)",
    borderColor: `rgba(${r},${g},${b},0.4)`,
  };
}
