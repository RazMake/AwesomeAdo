import { orderingPolicyProperty } from "../../../common/ordering/OrderingProperty";
import {
  resolveViewTypePropertyValue,
  type ViewType,
  type ViewTypeProperty,
} from "../../../common/view-common/ViewType";

export { orderingPolicyOf } from "../../../common/ordering/OrderingProperty";

/** How long a finished item keeps its place on the board; shared with its reader, as above. */
const hideResolvedAfterDaysProperty: ViewTypeProperty = {
  key: "days",
  label: "Hide resolved after (days)",
  required: false,
  kind: "number",
  defaultValue: "4",
  min: 0,
  max: 3650,
  hint: "Resolved items are hidden once resolved more than this many days ago, unless an unresolved item still sits beneath them. 0 hides them immediately.",
};

/** How far back per-item notes reach; shared with its reader, as above. */
const updatesWindowWeeksProperty: ViewTypeProperty = {
  key: "weeks",
  label: "Updates window (weeks)",
  required: false,
  kind: "number",
  defaultValue: "2",
  min: 1,
  max: 52,
  hint: "How far back per-item Updates reach, in weeks. Only newer updates are shown; same-day entries are collapsed together.",
};

/** What counts as "newly" for the recent-activity pills; shared with its reader, as above. */
const recentChangesWindowHoursProperty: ViewTypeProperty = {
  key: "hours",
  label: "Recent changes window (hours)",
  required: false,
  kind: "number",
  defaultValue: "24",
  min: 1,
  hint: "Rolling window behind the Newly Created, Newly Updated, and New Notes pills. Respected exactly, not rounded to whole days.",
};

/**
 * The Project Tracking view's configuration: presents a query's items grouped for status tracking,
 * with per-query control over ordering and the various "recent activity" windows.
 *
 * Every property is per-query (stored on the binding), so the same view bound to two queries can use
 * different windows. The ordering policy's raw sort key is resolved in `src/common/ordering`, not here.
 */
export const projectTrackingViewType: ViewType = {
  id: "projectTracking",
  label: "Project Tracking",
  properties: [
    orderingPolicyProperty,
    updatesWindowWeeksProperty,
    hideResolvedAfterDaysProperty,
    recentChangesWindowHoursProperty,
  ],
};

/**
 * How many days a resolved item stays on the board, from the binding's stored properties. Routed
 * through the shared resolver so the number the renderer hides by is the same defaulted, clamped
 * whole number the binding form showed.
 */
export function hideResolvedAfterDays(properties: Record<string, string>): number {
  return Number(
    resolveViewTypePropertyValue(
      hideResolvedAfterDaysProperty,
      properties[hideResolvedAfterDaysProperty.key],
    ),
  );
}

/**
 * How many weeks of notes an item's Updates panel reaches back over, from the binding's stored
 * properties. Routed through the shared resolver for the same reason as the day window: the number
 * the fetch bounds itself by is the defaulted, clamped whole number the binding form showed.
 */
export function updatesWindowWeeks(properties: Record<string, string>): number {
  return Number(
    resolveViewTypePropertyValue(
      updatesWindowWeeksProperty,
      properties[updatesWindowWeeksProperty.key],
    ),
  );
}

/**
 * How many hours back the recent-activity pills call a change "new", from the binding's stored
 * properties. Routed through the shared resolver for the same reason as the other windows: the pills
 * must narrow by exactly the defaulted, clamped number the binding form showed, or the board would
 * quietly disagree with its own configuration.
 */
export function recentChangesWindowHours(properties: Record<string, string>): number {
  return Number(
    resolveViewTypePropertyValue(
      recentChangesWindowHoursProperty,
      properties[recentChangesWindowHoursProperty.key],
    ),
  );
}
