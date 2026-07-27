/**
 * The Project Tracking board's recent-activity filter: three clickable pills that narrow the tree to
 * work that has moved inside the binding's "Recent changes window (hours)".
 *
 * Deliberately its own control rather than an option on the tag filter it shares a row with: these
 * pills answer "what changed?" while the tag pills answer "whose is it?", and they are configured,
 * colored and sized differently. It is stateless about the selection for the same reason the tag
 * pills are — it renders and mutates the caller's set, so the pills and the tree can never drift
 * apart.
 */

import {
  RECENT_ACTIVITY_FILTERS,
  type RecentActivityFilter,
  type RecentActivityKind,
} from "./recentActivity";

/** Options for rendering the recent-activity filter pills. */
export interface ActivityFilterPanelOptions {
  /** The active selection; the pills reflect it and toggle entries in it in place. */
  selected: Set<RecentActivityKind>;
  /** The binding's recent-changes window, named in each pill's tooltip so "newly" is not a guess. */
  windowHours: number;
  /**
   * True while the board is still reading discussions to answer the "New notes" pill. Shown on that
   * pill alone, because it is the only one whose answer is not already in the loaded tree.
   */
  notesPending: boolean;
  /** Called after a pill toggles, with the same (now-mutated) set the caller owns. */
  onChange: (selected: Set<RecentActivityKind>) => void;
}

/**
 * Deliberately a step up from the 9px tag pills next to them: these three are the board's coarse
 * "what changed?" switch and are read across the whole page, whereas a tag pill is a label that also
 * appears inline on every row and must not shout there.
 */
const PILL_FONT_SIZE_PX = 11;

/** The window in the shortest form that is still unambiguous ("1 hour", "24 hours"). */
function describeWindow(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** Builds one activity pill, already reflecting whether it is part of the active selection. */
function renderActivityPill(
  doc: Document,
  filter: RecentActivityFilter,
  options: ActivityFilterPanelOptions,
): HTMLButtonElement {
  const selected = options.selected.has(filter.kind);
  const pending = filter.kind === "notes" && options.notesPending;

  const pill = doc.createElement("button");
  pill.type = "button";
  pill.className = "awesomeado-activity-pill";
  pill.dataset.activity = filter.kind;
  if (selected) {
    pill.classList.add("awesomeado-activity-pill--selected");
  }
  // The ellipsis is the only visible sign that the answer is still being read; the pill keeps its
  // name so the reader is not left wondering which control changed under them.
  pill.textContent = pending ? `${filter.label}\u2026` : filter.label;
  pill.title = pending
    ? "Reading discussions to answer this filter\u2026"
    : `${filter.describes} in the last ${describeWindow(options.windowHours)}.`;
  pill.setAttribute("aria-pressed", selected ? "true" : "false");
  pill.setAttribute("aria-busy", pending ? "true" : "false");
  // Same dim/full-strength language as the tag pills, so one glance reads both rows of filters. The
  // border is always present so toggling changes only color, never the pill's size.
  pill.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "border-radius:11px",
    "padding:3px 10px",
    `font-size:${PILL_FONT_SIZE_PX}px`,
    "font-weight:600",
    "line-height:1.4",
    "white-space:nowrap",
    "cursor:pointer",
    "color:#fff",
    `background:${filter.background}`,
    selected ? "border:2px solid #fff" : "border:2px solid transparent",
    selected ? "opacity:1" : "opacity:0.55",
  ].join(";");

  pill.addEventListener("click", () => {
    if (selected) {
      options.selected.delete(filter.kind);
    } else {
      options.selected.add(filter.kind);
    }
    options.onChange(options.selected);
  });

  return pill;
}

/**
 * Renders the recent-activity filter pills. Selected pills form an **OR** (see
 * `matchesRecentActivity`); an empty selection leaves the board unnarrowed.
 *
 * Returned LOOSE rather than wrapped in a panel of their own: they close the board's single wrapping
 * filter row, and a wrapper around this group would break that row into segments that wrap
 * independently instead of flowing as one line.
 */
export function renderActivityFilterPills(
  doc: Document,
  options: ActivityFilterPanelOptions,
): HTMLElement[] {
  return RECENT_ACTIVITY_FILTERS.map((filter) => renderActivityPill(doc, filter, options));
}
