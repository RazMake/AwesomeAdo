import { filterPillStyle } from "../FilterPill/FilterPill";

import {
  RECENT_ACTIVITY_FILTERS,
  type RecentActivityFilter,
  type RecentActivityKind,
} from "./recentActivity";

/** Options for rendering the recent-activity filter pills. */
export interface ActivityFilterPanelOptions {
  selected: Set<RecentActivityKind>;
  windowHours: number;
  notesPending: boolean;
  onChange: (selected: Set<RecentActivityKind>) => void;
}

function describeWindow(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

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
  if (selected) pill.classList.add("awesomeado-activity-pill--selected");
  pill.textContent = pending ? `${filter.label}\u2026` : filter.label;
  pill.title = pending
    ? "Reading discussions to answer this filter\u2026"
    : `${filter.describes} in the last ${describeWindow(options.windowHours)}.`;
  pill.setAttribute("aria-pressed", String(selected));
  pill.setAttribute("aria-busy", String(pending));
  pill.style.cssText = filterPillStyle({
    background: filter.background,
    color: "var(--activity-foreground)",
    selected,
  });
  pill.addEventListener("click", () => {
    if (selected) options.selected.delete(filter.kind);
    else options.selected.add(filter.kind);
    options.onChange(options.selected);
  });
  return pill;
}

/** Render loose activity pills so they can participate in a view's single wrapping filter row. */
export function renderActivityFilterPills(
  doc: Document,
  options: ActivityFilterPanelOptions,
): HTMLElement[] {
  return RECENT_ACTIVITY_FILTERS.map((filter) => renderActivityPill(doc, filter, options));
}
