import type { WorkItemMarker, WorkItemMarkerTags } from "../../../settings/ExtensionSettings";

import { renderMarkerPill, type MarkerPillCounts } from "./MarkerPill";

/** Options for rendering the marker filter pills. */
export interface MarkerFilterPillsOptions {
  /** The markers to offer, in display order — typically the ones actually carried by loaded work. */
  markers: readonly WorkItemMarker[];
  /** The team's configured tags, so each pill can name the literal ADO tag it stands for. */
  markerTags: WorkItemMarkerTags;
  /** The active selection; the pills reflect it and toggle entries in it in place. */
  selected: Set<WorkItemMarker>;
  /**
   * The counters one marker's pill carries, or `undefined` for a bare pill. A view that can say how
   * much work a marker covers supplies it; one that cannot leaves the pill uncounted rather than
   * showing a zero it did not measure.
   */
  countsFor?: (marker: WorkItemMarker) => MarkerPillCounts | undefined;
  /** Called after a pill toggles, with the same (now-mutated) set the caller owns. */
  onChange: (selected: Set<WorkItemMarker>) => void;
}

/**
 * Clickable pills that narrow a view to the items flagged with a recognized condition. Selected
 * pills form an **OR**; the group as a whole is **AND**ed with a view's other filter groups, and an
 * empty selection narrows nothing.
 *
 * ONE control for every view that filters by marker: the pills are the same promise about the same
 * tags, so two renderings would drift in exactly the detail (which tag a color stands for) that
 * carries the meaning. Views differ only in which markers they offer and whether they can count
 * them.
 *
 * Returned loose so a view can place them inside its own wrapping filter families.
 *
 * Stateless about the selection: it renders the caller's set and mutates it on toggle, so the caller
 * stays the single source of truth for both the pills and the work they narrow.
 */
export function renderMarkerFilterPills(
  doc: Document,
  options: MarkerFilterPillsOptions,
): HTMLElement[] {
  const { markers, markerTags, selected, countsFor, onChange } = options;

  return markers.map((marker) =>
    renderMarkerPill(doc, {
      marker,
      // Only an Interrupt has an accepted lifetime; the other markers ignore this.
      accepted: marker === "interrupt",
      title: `Azure DevOps tag "${markerTags[marker].tag}"`,
      interactive: true,
      selected: selected.has(marker),
      counts: countsFor?.(marker),
      onToggle: () => {
        if (selected.has(marker)) {
          selected.delete(marker);
        } else {
          selected.add(marker);
        }
        onChange(selected);
      },
    }),
  );
}
