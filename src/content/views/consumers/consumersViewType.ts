import { orderingPolicyProperty } from "../../../common/ordering/OrderingProperty";
import { parseAreaPathList } from "../../../common/settings/SprintAreaPaths";
import type { ViewType, ViewTypeProperty } from "../../../common/view-common/ViewType";

export { orderingPolicyOf } from "../../../common/ordering/OrderingProperty";

const requestAreaPathsProperty: ViewTypeProperty = {
  key: "requestAreaPaths",
  label: "Feature request area paths",
  required: false,
  kind: "area-path-list",
  hint: "Add the area paths feature requests are shown from, one at a time. Each area path edit box offers autocomplete suggestions that match any part of the path. Leave empty to show requests from every area path.",
};

/**
 * The Consumers View's configuration: a tree query whose single root only groups the consumers
 * beneath it, each holding the feature requests it asked for.
 *
 * The area paths are per-query because they describe which team's requests this board is about;
 * two Consumers Views over the same consumers can each follow a different team's requests.
 */
export const consumersViewType: ViewType = {
  id: "consumers",
  label: "Consumers View",
  properties: [orderingPolicyProperty, requestAreaPathsProperty],
};

/** The full area paths a feature request must sit in to be shown; empty shows every request. */
export function consumerRequestAreaPaths(properties: Record<string, string>): string[] {
  return parseAreaPathList(properties[requestAreaPathsProperty.key]);
}
