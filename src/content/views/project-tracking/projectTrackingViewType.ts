import {
  DEFAULT_ORDERING_POLICY,
  ORDERING_POLICIES,
  type OrderingPolicy,
} from "../../../common/ordering/ItemOrdering";
import {
  resolveViewTypePropertyValue,
  type ViewType,
  type ViewTypeProperty,
} from "../../../common/view-common/ViewType";

/**
 * How items are ordered within each group. Declared as its own constant (rather than inline in the
 * property list) so the reader below resolves the SAME property the binding form wrote — the key,
 * the offered choices and the default can never drift between the two.
 */
const orderingPolicyProperty: ViewTypeProperty = {
  key: "orderingPolicy",
  label: "Items ordering policy",
  required: false,
  kind: "select",
  options: ORDERING_POLICIES.map((policy) => ({ value: policy.value, label: policy.label })),
  // Encapsulated in src/common/ordering so every renderer sorts items the same way; the raw
  // sort key (e.g. StackRank vs. the ETA field) is resolved by that component, not stored here.
  defaultValue: DEFAULT_ORDERING_POLICY,
  hint: "How items are ordered within each group.",
};

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

/**
 * The ordering policy a binding's stored properties select, defaulted when it stored none.
 *
 * The stored value is matched back against the offered policies rather than cast: a binding written
 * by a build that offered a policy this one no longer has would otherwise hand the renderer a policy
 * id nothing knows how to sort by.
 */
export function orderingPolicyOf(properties: Record<string, string>): OrderingPolicy {
  const stored = resolveViewTypePropertyValue(
    orderingPolicyProperty,
    properties[orderingPolicyProperty.key],
  );
  return (
    ORDERING_POLICIES.find((policy) => policy.value === stored)?.value ?? DEFAULT_ORDERING_POLICY
  );
}

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
