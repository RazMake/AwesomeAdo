import type { StorageObservation } from "../browser/observeSyncKeys";

import type { QueryBinding, QueryBindings } from "./QueryBinding";

/**
 * Abstraction over the persisted, browser-synced list of query bindings.
 *
 * Features depend on THIS, never on chrome.storage directly (Dependency Inversion), which is what
 * makes the top-bar prompt and the options binding form unit-testable with a fake store.
 */
export interface IQueryBindingStore {
  /** Read the current bindings, normalized to a complete map. */
  read(): Promise<QueryBindings>;

  /** Create or replace the binding for a single query. Other queries are left untouched. */
  bind(queryId: string, binding: QueryBinding): Promise<void>;

  /** Remove the binding for a single query. Other queries are left untouched; a no-op if absent. */
  unbind(queryId: string): Promise<void>;

  /**
   * Switch a bound query between its enhanced view and ADO's standard view, preserving the
   * binding's other fields. A no-op when the query is not bound.
   */
  setActiveView(queryId: string, active: QueryBinding["active"]): Promise<void>;

  /**
   * Subscribe before reading, then emit the initial snapshot unless a newer event wins the race.
   * `unsubscribe` is available immediately; `ready` rejects if the initial read fails.
   */
  observe(listener: (bindings: QueryBindings) => void): StorageObservation;
}
