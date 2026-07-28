/**
 * Which of the team's recognized conditions a work item carries, and which ones the board should
 * offer a filter pill for.
 *
 * Pure and DOM-free so the pills, the tree's visibility test and the tests all read the SAME answer
 * — a filter whose pill list and whose predicate disagreed would light a pill that hides everything.
 */

import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import { hasWorkItemTag } from "../../../../common/ado/workItemTags";
import {
  WORK_ITEM_MARKERS,
  type WorkItemMarker,
  type WorkItemMarkerTags,
} from "../../../../common/settings/ExtensionSettings";

/**
 * Does the item wear the Azure DevOps tag the team configured for this marker?
 *
 * A marker the team left blank is never carried by anything: a blank tag means "we do not use this
 * signal", and matching it against every item's tags would otherwise flag the whole board.
 */
export function itemHasMarker(
  item: TrackedWorkItem,
  marker: WorkItemMarker,
  markerTags: WorkItemMarkerTags,
): boolean {
  return hasWorkItemTag(item.tags, markerTags[marker].tag);
}

/**
 * The markers actually present somewhere in the tree, in the settings' own presentation order.
 *
 * The filter row is built from this rather than from the configured markers, so a pill only appears
 * once there is something for it to narrow to — a lit pill that could never match anything is a
 * control that only knows how to empty the board.
 */
export function collectMarkersInUse(
  root: TrackedWorkItem,
  markerTags: WorkItemMarkerTags,
): WorkItemMarker[] {
  const found = new Set<WorkItemMarker>();
  const visit = (item: TrackedWorkItem): void => {
    for (const { key } of WORK_ITEM_MARKERS) {
      if (!found.has(key) && itemHasMarker(item, key, markerTags)) {
        found.add(key);
      }
    }
    for (const child of item.children) {
      visit(child);
    }
  };
  visit(root);
  return WORK_ITEM_MARKERS.map(({ key }) => key).filter((key) => found.has(key));
}

/**
 * The predicate the tree narrows by: an item passes when it carries ANY lit marker (an OR across the
 * pills), and every item passes while none is lit — the same "an unlit group imposes nothing" rule
 * the crew-tag and recent-activity groups follow, so the three AND together without any of them
 * being able to empty the board on its own.
 */
export function createMarkerFilter(
  markerTags: WorkItemMarkerTags,
  selected: ReadonlySet<WorkItemMarker>,
): (item: TrackedWorkItem) => boolean {
  return (item) =>
    selected.size === 0 || [...selected].some((marker) => itemHasMarker(item, marker, markerTags));
}
