import { WORK_ITEM_MARKERS, type WorkItemMarker } from "../../../settings/ExtensionSettings";

/** The fill and text color one marker's pill wears. */
interface MarkerPillPaint {
  background: string;
  color: string;
}

/**
 * How each recognized condition is painted, everywhere it is shown.
 *
 * FIXED colors, deliberately not theme tokens: a marker pill is a *warning*, and its whole job is to
 * be told apart from the surface it sits on. Under "Follow ADO" the neutral tokens fall through to
 * ADO's own surface colors, which is exactly what the pill must not blend into — the same trap the
 * context menu's hover wash and the rollup checkbox's frame document. The three hues are also chosen
 * to survive a dark surface AND a light one without changing, so one pill means one thing on every
 * theme.
 *
 * Text color is per-hue rather than always white: white on the amber "blocked" fill is the one
 * combination here that drops under a readable contrast ratio, so that pill carries near-black.
 */
const MARKER_PILL_PAINT: Record<WorkItemMarker, MarkerPillPaint> = {
  blocked: { background: "rgb(214,126,20)", color: "#1a1a1a" },
  blockedByOtherTeam: { background: "rgb(196,43,43)", color: "#ffffff" },
  interrupt: { background: "rgb(124,58,183)", color: "#ffffff" },
};

/** How a marker names itself: the same wording the options page labels its row with. */
export function markerLabel(marker: WorkItemMarker): string {
  return WORK_ITEM_MARKERS.find((entry) => entry.key === marker)?.label ?? marker;
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
   * When true the pill is an interactive filter toggle (a `<button>`): unselected pills read dimmed
   * and selected pills read full-strength with a ring. When false (the default) it is a static
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
   * Kept apart from `interactive` because the two say different things: a filter toggle is dimmed
   * until it is on, whereas this one states a condition the item genuinely carries and so must keep
   * reading at full strength — dimming it would claim the item is only half blocked.
   */
  onActivate?: () => void;
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
  const paint = MARKER_PILL_PAINT[marker];
  const activates = options.onActivate !== undefined;

  const pill = doc.createElement(interactive || activates ? "button" : "span");
  pill.className = "awesomeado-marker-pill";
  pill.dataset.marker = marker;
  pill.textContent = markerLabel(marker);
  if (options.title !== undefined) {
    pill.title = options.title;
  }

  const styles = [
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "border-radius:9px",
    "padding:1px 8px",
    "font-size:9px",
    "font-weight:600",
    "line-height:1.6",
    "white-space:nowrap",
    `color:${paint.color}`,
    `background:${paint.background}`,
  ];

  if (interactive) {
    styles.push(...asFilterToggle(pill, selected, options.onToggle));
  } else if (activates) {
    styles.push(...asOpener(pill, options.onActivate));
  }

  pill.style.cssText = styles.join(";");
  return pill;
}

/** Turn the pill into the board's filter toggle, and return the styles that say whether it is on. */
function asFilterToggle(
  pill: HTMLElement,
  selected: boolean,
  onToggle: (() => void) | undefined,
): string[] {
  (pill as HTMLButtonElement).type = "button";
  pill.setAttribute("aria-pressed", selected ? "true" : "false");
  if (selected) {
    pill.classList.add("awesomeado-marker-pill--selected");
  }
  pill.addEventListener("click", () => onToggle?.());
  return [
    "cursor:pointer",
    // The border is always present so toggling changes only color, never the pill's size — the same
    // dim/full-strength language the tag and activity pills beside it use.
    selected ? "border:2px solid #fff" : "border:2px solid transparent",
    selected ? "opacity:1" : "opacity:0.55",
  ];
}

/** Turn the pill into a button that opens what stands behind it, at full strength. */
function asOpener(pill: HTMLElement, onActivate: (() => void) | undefined): string[] {
  (pill as HTMLButtonElement).type = "button";
  pill.setAttribute("aria-haspopup", "dialog");
  pill.addEventListener("click", (event) => {
    // The row underneath opens the item's own notes; this pill answers a narrower question.
    event.stopPropagation();
    onActivate?.();
  });
  return ["cursor:pointer", "border:none", "font:inherit", "font-size:9px", "font-weight:600"];
}
