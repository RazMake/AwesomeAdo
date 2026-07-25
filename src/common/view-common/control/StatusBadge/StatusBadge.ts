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
 * A work-item status badge showing the current ADO state with a muted, position-specific tint.
 *
 * The badge colors the state by its global board-column ordinal (see `colorsForOrdinal`) so the same
 * position reads identically across every work-item type. When editable (and columns are provided),
 * clicking opens a dropdown to change the state; selecting a column calls onChange and closes the
 * popup immediately. Escape and outside clicks dismiss the popup.
 */
export function renderStatusBadge(doc: Document, options: StatusBadgeOptions): HTMLElement {
  const { state, ordinal, columns = [], editable = false, minWidthCh, onChange } = options;

  const isInteractive = editable && columns.length > 0;

  // Root container: position:relative so the popup can anchor to it.
  const root = doc.createElement("span");
  root.className = "awesomeado-status";
  root.style.cssText = ["position:relative", "display:inline-flex", "align-items:center"].join(";");

  // The badge chip showing the current state.
  const badge = doc.createElement("span");
  badge.className = "awesomeado-status__badge";

  const { background, textColor, borderColor } = colorsForOrdinal(ordinal);
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
    `background:${background}`,
    `color:${textColor}`,
    `border:1px solid ${borderColor}`,
    "border-radius:3px",
    "padding:2px 8px",
    "font-size:11px",
    `width:${badgeWidthCh}ch`,
    "overflow:hidden",
    "white-space:nowrap",
    "display:inline-flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:4px",
  ].join(";");

  badge.textContent = state;

  // Render a caret affordance when interactive.
  if (isInteractive) {
    const caret = doc.createElement("span");
    caret.textContent = "▾";
    caret.style.cssText = "font-size:9px;opacity:0.7";
    badge.append(caret);
  }

  root.append(badge);

  // Track popup state.
  let popup: HTMLElement | null = null;

  // Open the dropdown popup.
  const openPopup = () => {
    if (popup || !isInteractive) return; // Already open or not interactive.

    popup = doc.createElement("div");
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

    // The active state is context, not a possible transition.
    columns
      .filter((col) => col.primaryState !== state && col.column !== state)
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
          closePopup();
        });

        // Hover highlight uses ADO theme token.
        row.addEventListener("mouseenter", () => {
          row.style.boxShadow =
            "inset 0 0 0 999px var(--palette-neutral-4, rgba(128,128,128,0.12))";
        });
        row.addEventListener("mouseleave", () => {
          row.style.boxShadow = "none";
        });

        popup!.append(row);
      });

    root.append(popup);

    // Dismiss on outside pointerdown (capture) and Escape.
    doc.addEventListener("pointerdown", handleOutsidePointer, true);
    doc.addEventListener("keydown", handleKeydown, true);
  };

  // Close the dropdown popup.
  const closePopup = () => {
    if (!popup) return;
    popup.remove();
    popup = null;
    doc.removeEventListener("pointerdown", handleOutsidePointer, true);
    doc.removeEventListener("keydown", handleKeydown, true);
  };

  // Toggle popup on badge click (only when interactive).
  if (isInteractive) {
    badge.addEventListener("click", () => {
      if (popup) {
        closePopup();
      } else {
        openPopup();
      }
    });
  }

  const handleOutsidePointer = (event: Event): void => {
    const target = event.target as Node | null;
    // Ignore clicks on the badge so its own handler can toggle without a close/reopen race.
    if (target && (popup?.contains(target) || badge.contains(target))) {
      return;
    }
    closePopup();
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      closePopup();
    }
  };

  return root;
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
