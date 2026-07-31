import {
  resolveViewTypePropertyValue,
  type ViewType,
  type ViewTypeProperty,
} from "../../../common/view-common/ViewType";

const recentChangesWindowHoursProperty: ViewTypeProperty = {
  key: "hours",
  label: "Recent changes window (hours)",
  required: false,
  kind: "number",
  defaultValue: "24",
  min: 1,
  hint: "Rolling window behind the Newly Created, Newly Updated, and New Notes filters.",
};

/**
 * The Sprint View's configuration: presents a query's work grouped by sprint (iteration).
 *
 * It needs no per-query properties yet — the sprint window is driven by the global ADO settings — so
 * a query can be bound to it as-is. Add entries to `properties` here to expose per-query settings.
 */
export const sprintViewType: ViewType = {
  id: "sprint",
  label: "Sprint View",
  properties: [recentChangesWindowHoursProperty],
};

/** The rolling window used by Sprint View's three recent-activity filters. */
export function sprintRecentChangesHours(properties: Record<string, string>): number {
  return Number(
    resolveViewTypePropertyValue(
      recentChangesWindowHoursProperty,
      properties[recentChangesWindowHoursProperty.key],
    ),
  );
}
