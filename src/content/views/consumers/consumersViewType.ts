import { orderingPolicyProperty } from "../../../common/ordering/OrderingProperty";
import { parseAreaPathList } from "../../../common/settings/SprintAreaPaths";
import type { ViewType, ViewTypeProperty } from "../../../common/view-common/ViewType";

export { orderingPolicyOf } from "../../../common/ordering/OrderingProperty";

const consumerAreaPathsProperty: ViewTypeProperty = {
  key: "consumerAreaPaths",
  label: "Consumer area paths",
  required: false,
  kind: "area-path-list",
  hint: "Add the area paths consumers are shown from, one at a time. Each area path edit box offers autocomplete suggestions that match any part of the path. A shown consumer always lists every one of its feature requests. Leave empty to show every consumer.",
};

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
  properties: [orderingPolicyProperty, consumerAreaPathsProperty],
};

/** The area branches a consumer must sit in to be shown; empty shows every consumer. */
export function consumerAreaPaths(properties: Record<string, string>): string[] {
  return parseAreaPathList(properties[consumerAreaPathsProperty.key]);
}
