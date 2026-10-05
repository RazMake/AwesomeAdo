import {
  MANUAL_ORDERING_POLICY,
  type OrderingPolicy,
  type OrderingPolicyOption,
} from "../../../common/ordering/ItemOrdering";
import { orderingPolicyProperty } from "../../../common/ordering/OrderingProperty";
import { parseAreaPathList } from "../../../common/settings/SprintAreaPaths";
import {
  resolveViewTypePropertyValue,
  type ViewType,
  type ViewTypeProperty,
} from "../../../common/view-common/ViewType";

/**
 * The only orders a consumers board offers: the hand-made drag order (stored as backlog rank, so
 * "importance" under the hood) or the date each request is needed by. Alphabetical order answers no
 * question a consumer list is asked, so it is not offered.
 */
export const CONSUMERS_ORDERING_POLICIES: readonly OrderingPolicyOption[] = [
  { value: MANUAL_ORDERING_POLICY, label: "Drag-and-drop order" },
  { value: "eta", label: "By ETA (past/recent - future)" },
];

// Same storage key as the shared property, so a binding saved before the list was narrowed keeps
// its choice; only the offered options differ.
const consumersOrderingProperty: ViewTypeProperty = {
  ...orderingPolicyProperty,
  options: CONSUMERS_ORDERING_POLICIES.map(({ value, label }) => ({ value, label })),
  defaultValue: MANUAL_ORDERING_POLICY,
  hint: "How feature requests are ordered. Drag-and-drop order lets you reorder requests by hand.",
};

const requestAreaPathsProperty: ViewTypeProperty = {
  key: "requestAreaPaths",
  label: "Request area paths",
  required: false,
  kind: "area-path-list",
  hint: "Add the area paths feature requests are shown from, one at a time; each includes its sub-areas. Each area path edit box offers autocomplete suggestions that match any part of the path. Consumers are always shown, whatever their area. Leave empty to show every request.",
};

/**
 * The key this setting was saved under while it scoped consumers. Still read when the new key was
 * never saved, so an existing binding keeps its paths instead of silently showing every request.
 */
const LEGACY_AREA_PATHS_KEY = "consumerAreaPaths";

/**
 * The Consumers View's configuration: a tree query whose single root only groups the consumers
 * beneath it, each holding the feature requests it asked for.
 *
 * The area paths are per-query because they describe which team's consumers this board is about;
 * two Consumers Views over the same grouping item can each follow a different team's consumers.
 */
export const consumersViewType: ViewType = {
  id: "consumers",
  label: "Consumers View",
  properties: [consumersOrderingProperty, requestAreaPathsProperty],
};

/** The area branches a feature request must sit in to be shown; empty shows every request. */
export function requestAreaPaths(properties: Record<string, string>): string[] {
  return parseAreaPathList(
    properties[requestAreaPathsProperty.key] ?? properties[LEGACY_AREA_PATHS_KEY],
  );
}

/** The binding's ordering, with any policy this board does not offer read as the drag order. */
export function orderingPolicyOf(properties: Record<string, string>): OrderingPolicy {
  const stored = resolveViewTypePropertyValue(
    consumersOrderingProperty,
    properties[consumersOrderingProperty.key],
  );
  return (
    CONSUMERS_ORDERING_POLICIES.find((policy) => policy.value === stored)?.value ??
    MANUAL_ORDERING_POLICY
  );
}
