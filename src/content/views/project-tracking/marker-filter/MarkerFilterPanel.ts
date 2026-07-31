import type {
  WorkItemMarker,
  WorkItemMarkerTags,
} from "../../../../common/settings/ExtensionSettings";
import { renderMarkerPill } from "../../../../common/view-common/control/MarkerPill/MarkerPill";

/** Options for rendering the marker filter pills. */
export interface MarkerFilterPanelOptions {
  /** The markers to offer, in display order — typically the ones actually carried in the tree. */
  markers: WorkItemMarker[];
  /** The team's configured tags, so each pill can name the literal ADO tag it stands for. */
  markerTags: WorkItemMarkerTags;
  /** The active selection; the pills reflect it and toggle entries in it in place. */
  selected: Set<WorkItemMarker>;
  /** Called after a pill toggles, with the same (now-mutated) set the caller owns. */
  onChange: (selected: Set<WorkItemMarker>) => void;
}

/**
 * Clickable pills that narrow the board to the items flagged with a recognized condition. Selected
 * pills form an **OR**; the group as a whole is **AND**ed with the crew-tag and recent-activity
 * groups, and an empty selection narrows nothing.
 *
 * Returned loose so the board can place them beside crew tags in its non-activity family.
 *
 * Stateless about the selection, like those groups: it renders the caller's set and mutates it on
 * toggle, so the caller stays the single source of truth for both the pills and the tree.
 */
export function renderMarkerFilterPills(
  doc: Document,
  options: MarkerFilterPanelOptions,
): HTMLElement[] {
  const { markers, markerTags, selected, onChange } = options;

  return markers.map((marker) =>
    renderMarkerPill(doc, {
      marker,
      title: `Azure DevOps tag "${markerTags[marker].tag}"`,
      interactive: true,
      selected: selected.has(marker),
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
