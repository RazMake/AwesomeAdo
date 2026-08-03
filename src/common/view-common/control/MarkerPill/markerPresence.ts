import type { TrackedWorkItem } from "../../../ado/TrackedWorkItem";
import { hasWorkItemTag } from "../../../ado/workItemTags";
import {
  WORK_ITEM_MARKERS,
  type WorkItemMarker,
  type WorkItemMarkerTags,
} from "../../../settings/ExtensionSettings";

/** Whether an item carries the configured tag for one recognized marker. */
export function itemHasMarker(
  item: TrackedWorkItem,
  marker: WorkItemMarker,
  markerTags: WorkItemMarkerTags,
): boolean {
  return hasWorkItemTag(item.tags, markerTags[marker].tag);
}

/** Markers carried by at least one of `items`, in the settings' presentation order. */
export function collectMarkersInUse(
  items: readonly TrackedWorkItem[],
  markerTags: WorkItemMarkerTags,
): WorkItemMarker[] {
  return WORK_ITEM_MARKERS.map(({ key }) => key).filter((key) =>
    items.some((item) => itemHasMarker(item, key, markerTags)),
  );
}

/** Build the OR predicate for a selected marker set; an empty set matches every item. */
export function createMarkerFilter(
  markerTags: WorkItemMarkerTags,
  selected: ReadonlySet<WorkItemMarker>,
): (item: TrackedWorkItem) => boolean {
  return (item) =>
    selected.size === 0 || [...selected].some((marker) => itemHasMarker(item, marker, markerTags));
}
