import type { ViewType } from "../../../common/view-common/ViewType";

/**
 * The Sprint View's configuration: presents a query's work grouped by sprint (iteration).
 *
 * It needs no per-query properties yet — the sprint window is driven by the global ADO settings — so
 * a query can be bound to it as-is. Add entries to `properties` here to expose per-query settings.
 */
export const sprintViewType: ViewType = {
  id: "sprint",
  label: "Sprint View",
  properties: [],
};
