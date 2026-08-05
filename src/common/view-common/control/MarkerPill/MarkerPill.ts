import { WORK_ITEM_MARKERS, type WorkItemMarker } from "../../../settings/ExtensionSettings";
import { filterPillStyle, renderFilterPillCount } from "../FilterPill/FilterPill";

/** The fill and text color one marker's pill wears. */
interface MarkerPillPaint {
  background: string;
  color: string;
  edge?: string;
}

/** Counts attached to an interactive marker filter. */
export interface MarkerPillCounts {
  total: number;
  acceptedInSprint?: number;
}

/**
 * How each recognized condition is painted, everywhere it is shown.
 *
 * Dedicated semantic theme roles keep each warning distinct from its surface and let future themes
 * tune contrast without changing this control.
 *
 * Text color is per-hue rather than always white: white on the amber "blocked" fill is the one
 * combination here that drops under a readable contrast ratio, so that pill carries near-black.
 */
const MARKER_PILL_PAINT: Record<WorkItemMarker, MarkerPillPaint> = {
  blocked: {
    background: "var(--marker-blocked-background)",
    color: "var(--marker-blocked-foreground)",
  },
  blockedByOtherTeam: {
    background: "var(--marker-other-background)",
    color: "var(--marker-other-foreground)",
  },
  interrupt: {
    background: "var(--marker-interrupt-background)",
    color: "var(--marker-interrupt-foreground)",
  },
};

/** How a marker names itself: the same wording the options page labels its row with. */
export function markerLabel(marker: WorkItemMarker): string {
  return WORK_ITEM_MARKERS.find((entry) => entry.key === marker)?.label ?? marker;
}

/**
 * The colour one marker is recognized by, for a surface that flags something ABOUT a marker rather
 * than showing the marker itself (a note's dot in the complete discussion).
 *
 * Read from the pill's own paint so a dot and the pill it refers to can never end up different
 * colours — the colour is the only thing tying the two together.
 */
export function markerAccentColor(marker: WorkItemMarker): string {
  return MARKER_PILL_PAINT[marker].background;
}

/** Options for rendering a marker pill. */
export interface MarkerPillOptions {
  /** Which recognized condition the pill stands for; decides both its wording and its color. */
  marker: WorkItemMarker;
  /**
   * The pill's tooltip — normally the Azure DevOps tag the team configured for this marker, so a
   * reader can tell which literal tag the pill is standing in for. Omitted leaves it untitled.
   */
  title?: string;
  /**
   * When true the pill is an interactive filter toggle (a `<button>`): selected pills gain a ring
   * while every pill stays at full opacity. When false (the default) it is a static
   * `<span>` label — what a menu command shows.
   */
  interactive?: boolean;
  /** When interactive, whether this pill is currently part of the active filter. */
  selected?: boolean;
  /** When interactive, called when the pill is clicked (the caller flips the selection and re-renders). */
  onToggle?: () => void;
  /**
   * Makes the pill a `<button>` that OPENS something (the reasons behind it) rather than filtering.
   *
   * Kept apart from `interactive` because the two say different things: a filter toggle changes a
   * selection, whereas this one states a condition the item genuinely carries and opens its reasons.
   */
  onActivate?: () => void;
  /** Whether an Interrupt belongs to its current accepted tagged lifetime. Ignored by other markers. */
  accepted?: boolean;
  /** Tag total, plus the accepted-in-sprint split used only by Interrupt. */
  counts?: MarkerPillCounts;
}

/**
 * Render one of the team's recognized conditions as a colored pill.
 *
 * ONE control for every place a marker is shown — on the item row, inside the right-click command
 * that applies it, and on the board's filter row — because those surfaces have to be recognizably
 * the same thing: the pill in the menu is a preview of the pill the item will wear. Separate
 * renderings would drift in precisely the detail (the color) that carries the whole meaning.
 */
export function renderMarkerPill(doc: Document, options: MarkerPillOptions): HTMLElement {
  const { marker, interactive = false, selected = false } = options;
  const accepted = marker === "interrupt" && options.accepted === true;
  const paint = markerPillPaint(marker, accepted);
  const activates = options.onActivate !== undefined;

  const pill = doc.createElement(interactive || activates ? "button" : "span");
  pill.className = "awesomeado-marker-pill";
  pill.dataset.marker = marker;
  if (marker === "interrupt") pill.dataset.accepted = String(accepted);
  pill.textContent = markerLabel(marker);
  if (options.title !== undefined) {
    pill.title = options.title;
  }

  pill.style.cssText = markerPillStyles(paint, interactive, selected).join(";");
  wireMarkerPill(pill, options, interactive, activates, selected);
  if (options.counts !== undefined) {
    appendMarkerCounts(doc, pill, marker, options.counts);
  }
  return pill;
}

function markerPillPaint(marker: WorkItemMarker, accepted: boolean): MarkerPillPaint {
  if (marker !== "interrupt" || accepted) return MARKER_PILL_PAINT[marker];
  return {
    background: "color-mix(in srgb, var(--marker-interrupt-background) 24%, transparent)",
    color: "var(--marker-interrupt-foreground)",
    edge: "var(--marker-interrupt-background)",
  };
}

function markerPillStyles(
  paint: MarkerPillPaint,
  interactive: boolean,
  selected: boolean,
): string[] {
  if (interactive) {
    const styles = [
      filterPillStyle({ background: paint.background, color: paint.color, selected }),
    ];
    if (paint.edge !== undefined) styles.push(`box-shadow:inset 0 0 0 1px ${paint.edge}`);
    return styles;
  }
  // A pill that opens its reasons is a <button>, which arrives with its own font, margin, box model
  // and border. Every one of those is stated here — and the edge is always drawn, transparent when
  // the paint has none — so one variant can never render one size in a menu and another on a card.
  return [
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "border-radius:9px",
    "margin:0",
    "padding:1px 8px",
    "font-family:inherit",
    "font-size:9px",
    "font-weight:600",
    "line-height:1.6",
    "white-space:nowrap",
    `color:${paint.color}`,
    `background:${paint.background}`,
    `border:1px solid ${paint.edge ?? "transparent"}`,
  ];
}

function wireMarkerPill(
  pill: HTMLElement,
  options: MarkerPillOptions,
  interactive: boolean,
  activates: boolean,
  selected: boolean,
): void {
  // Both helpers return void deliberately. A variant that could hand back styles to append to
  // `cssText` is exactly how the opener once erased the raised Interrupt's edge: paint and geometry
  // are decided once, above, and nothing downstream is given the chance to overrule them.
  if (interactive) asFilterToggle(pill, selected, options.onToggle);
  else if (activates) asOpener(pill, options.onActivate);
}

function appendMarkerCounts(
  doc: Document,
  pill: HTMLElement,
  marker: WorkItemMarker,
  counts: MarkerPillCounts,
): void {
  const accepted = marker === "interrupt" ? counts.acceptedInSprint : undefined;
  const unaccepted = accepted === undefined ? 0 : Math.max(0, counts.total - accepted);
  if (accepted !== undefined && unaccepted > 0) {
    pill.append(
      markerCount(doc, unaccepted, "unaccepted", "Not yet accepted"),
      markerCount(doc, accepted, "accepted", "Accepted in sprint", true),
    );
    return;
  }
  pill.append(markerCount(doc, counts.total, "total", "Items with this tag"));
}

function markerCount(
  doc: Document,
  value: number,
  kind: string,
  label: string,
  accepted = false,
): HTMLElement {
  return renderFilterPillCount(doc, {
    value,
    kind,
    label,
    background: accepted ? "var(--communication-background)" : "var(--palette-neutral-20)",
    color: accepted ? "var(--text-on-communication-background)" : "var(--text-primary-color)",
  });
}

/** Turn the pill into the board's filter toggle, saying whether it is currently on. */
function asFilterToggle(
  pill: HTMLElement,
  selected: boolean,
  onToggle: (() => void) | undefined,
): void {
  (pill as HTMLButtonElement).type = "button";
  pill.setAttribute("aria-pressed", selected ? "true" : "false");
  if (selected) {
    pill.classList.add("awesomeado-marker-pill--selected");
  }
  pill.addEventListener("click", () => onToggle?.());
}

/**
 * Turn the pill into a button that opens what stands behind it.
 *
 * Adds nothing but the pointer: opening a pill's reasons says nothing about the condition it states,
 * so it must not repaint or resize the pill the reader is comparing against the one in a menu.
 */
function asOpener(pill: HTMLElement, onActivate: (() => void) | undefined): void {
  (pill as HTMLButtonElement).type = "button";
  pill.setAttribute("aria-haspopup", "dialog");
  pill.style.cursor = "pointer";
  pill.addEventListener("click", (event) => {
    // The row underneath opens the item's own notes; this pill answers a narrower question.
    event.stopPropagation();
    onActivate?.();
  });
}
