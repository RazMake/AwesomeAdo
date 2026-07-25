import type { ViewType } from "../../common/view-common/ViewType";

import { projectTrackingViewType } from "./project-tracking/projectTrackingViewType";
import { sprintViewType } from "./sprint/sprintViewType";

/**
 * Every view offered to the user, in the order they appear in the picker.
 *
 * Each entry is imported from that view's own folder (`src/content/views/<view>/`), so a view's
 * configuration lives beside its renderer rather than in one central list. Adding a view is a folder
 * plus one line here — see `src/content/views/README.md` and the `add-enhanced-view` skill.
 */
export const VIEW_TYPES: readonly ViewType[] = [sprintViewType, projectTrackingViewType];

/** Look up a view by its stored id, or undefined when the id is unknown (e.g. a newer build). */
export function getViewType(id: string): ViewType | undefined {
  return VIEW_TYPES.find((view) => view.id === id);
}
