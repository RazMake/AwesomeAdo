import type { ActiveView } from "../../common/bindings/QueryBinding";

/**
 * Read access to this session's per-query view overrides.
 *
 * A binding records *which* enhanced view a query uses; this records the user's in-session choice of
 * whether to show that view or ADO's own page for the query right now. It is deliberately the read
 * half of the contract (Interface Segregation): the controllers that render the page and drive the
 * top-bar menu only need to look an override up, while only the composition root that owns the
 * concrete store writes to it.
 */
export interface IActiveViewOverrides {
  /**
   * The override for a query, or `undefined` when the query still follows the global default view.
   * `undefined` is the ground state on every page load, which is why a reopened browser shows the
   * configured default rather than whatever was last toggled.
   */
  get(queryId: string): ActiveView | undefined;
}
