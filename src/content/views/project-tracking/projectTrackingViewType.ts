import { DEFAULT_ORDERING_POLICY, ORDERING_POLICIES } from "../../../common/ordering/ItemOrdering";
import type { ViewType } from "../../../common/view-common/ViewType";

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
    {
      key: "orderingPolicy",
      label: "Items ordering policy",
      required: false,
      kind: "select",
      options: ORDERING_POLICIES.map((policy) => ({ value: policy.value, label: policy.label })),
      // Encapsulated in src/common/ordering so every renderer sorts items the same way; the raw
      // sort key (e.g. StackRank vs. the ETA field) is resolved by that component, not stored here.
      defaultValue: DEFAULT_ORDERING_POLICY,
      hint: "How items are ordered within each group.",
    },
    {
      key: "weeks",
      label: "Updates window (weeks)",
      required: false,
      kind: "number",
      defaultValue: "2",
      min: 1,
      max: 52,
      hint: "How far back per-item Updates reach, in weeks. Only newer updates are shown; same-day entries are collapsed together.",
    },
    {
      key: "days",
      label: "Hide resolved after (days)",
      required: false,
      kind: "number",
      defaultValue: "4",
      min: 0,
      max: 3650,
      hint: "Resolved items are hidden once resolved more than this many days ago, unless an unresolved item still sits beneath them. 0 hides them immediately.",
    },
    {
      key: "hours",
      label: "Recent changes window (hours)",
      required: false,
      kind: "number",
      defaultValue: "24",
      min: 1,
      hint: "Rolling window behind the Newly Created, Newly Updated, and New Notes pills. Respected exactly, not rounded to whole days.",
    },
  ],
};
