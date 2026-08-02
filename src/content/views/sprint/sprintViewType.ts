import { orderingPolicyProperty } from "../../../common/ordering/OrderingProperty";
import { normalizeAreaPaths } from "../../../common/settings/SprintAreaPaths";
import {
  resolveViewTypePropertyValue,
  type ViewType,
  type ViewTypeProperty,
} from "../../../common/view-common/ViewType";

export { orderingPolicyOf as sprintOrderingPolicy } from "../../../common/ordering/OrderingProperty";

const recentChangesWindowHoursProperty: ViewTypeProperty = {
  key: "hours",
  label: "Recent changes window (hours)",
  required: false,
  kind: "number",
  defaultValue: "24",
  min: 1,
  hint: "Rolling window behind the Newly Created, Newly Updated, and New Notes filters.",
};

const defaultAreaPathsProperty: ViewTypeProperty = {
  key: "defaultAreaPaths",
  label: "Default Area Paths for the team",
  required: false,
  kind: "area-path-list",
  hint: "Add the default area paths for the team one at a time. Each area path edit box offers autocomplete suggestions that match any part of the path. These defaults are used only when a sprint has no saved Lane selection.",
};

/**
 * The Sprint View's configuration: presents a query's work grouped by sprint (iteration).
 *
 * The sprint window is driven by global ADO settings, while presentation defaults remain specific
 * to the query binding so two Sprint Views can start with different Lane scopes.
 */
export const sprintViewType: ViewType = {
  id: "sprint",
  label: "Sprint View",
  properties: [orderingPolicyProperty, recentChangesWindowHoursProperty, defaultAreaPathsProperty],
};

/** Full Lane paths used when the selected sprint has no team-shared selection yet. */
export function sprintDefaultAreaPaths(properties: Record<string, string>): string[] {
  return normalizeAreaPaths((properties[defaultAreaPathsProperty.key] ?? "").split(/\r?\n/));
}

/** The rolling window used by Sprint View's three recent-activity filters. */
export function sprintRecentChangesHours(properties: Record<string, string>): number {
  return Number(
    resolveViewTypePropertyValue(
      recentChangesWindowHoursProperty,
      properties[recentChangesWindowHoursProperty.key],
    ),
  );
}
