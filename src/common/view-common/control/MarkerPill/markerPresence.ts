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

/** Markers present somewhere in a tree, in the settings' presentation order. */
export function collectMarkersInUse(
  root: TrackedWorkItem,
  markerTags: WorkItemMarkerTags,
): WorkItemMarker[] {
  const found = new Set<WorkItemMarker>();
  const visit = (item: TrackedWorkItem): void => {
    for (const { key } of WORK_ITEM_MARKERS) {
      if (!found.has(key) && itemHasMarker(item, key, markerTags)) found.add(key);
    }
    for (const child of item.children) visit(child);
  };
  visit(root);
  return WORK_ITEM_MARKERS.map(({ key }) => key).filter((key) => found.has(key));
}

/** Build the OR predicate for a selected marker set; an empty set matches every item. */
export function createMarkerFilter(
  markerTags: WorkItemMarkerTags,
  selected: ReadonlySet<WorkItemMarker>,
): (item: TrackedWorkItem) => boolean {
  return (item) =>
    selected.size === 0 || [...selected].some((marker) => itemHasMarker(item, marker, markerTags));
}
