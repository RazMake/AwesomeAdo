import type { ActiveView } from "../../common/bindings/QueryBinding";

import type { IActiveViewOverrides } from "./IActiveViewOverrides";

/**
 * Holds each query's view choice for the lifetime of one page session, and nothing longer.
 *
 * Switching a query between its enhanced view and ADO's standard page is a "just for now" action, so
 * the choice is intentionally *not* persisted — it lives only in this in-memory map. When the content
 * script is re-injected (a fresh page load, or reopening the browser) the map starts empty again and
 * every bound query falls back to the configured default view. Keeping this out of synced storage is
 * what makes that fall-back happen.
 */
export class SessionActiveViewOverrides implements IActiveViewOverrides {
  private readonly overrides = new Map<string, ActiveView>();

  get(queryId: string): ActiveView | undefined {
    return this.overrides.get(queryId);
  }

  set(queryId: string, active: ActiveView): void {
    this.overrides.set(queryId, active);
  }
}
