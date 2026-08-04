import type { StorageObservation } from "../browser/observeStorageKeys";

import type { IQueryBindingWriter } from "./IQueryBindingWriter";
import type { QueryBindings } from "./QueryBinding";

/**
 * Abstraction over the persisted, browser-synced list of query bindings.
 *
 * Features depend on THIS, never on chrome.storage directly (Dependency Inversion), which is what
 * makes the top-bar prompt and the options binding form unit-testable with a fake store.
 */
export interface IQueryBindingStore extends IQueryBindingWriter {
  /** Read the current bindings, normalized to a complete map. */
  read(): Promise<QueryBindings>;

  /**
   * Replace the entire bindings map in one write. Unlike `bind`/`unbind`, this does not merge with
   * the current value — it is how an imported configuration wholesale adopts a saved set of bindings.
   */
  replaceAll(bindings: QueryBindings): Promise<void>;

  /**
   * Subscribe before reading, then emit the initial snapshot unless a newer event wins the race.
   * `unsubscribe` is available immediately; `ready` rejects if the initial read fails.
   */
  observe(listener: (bindings: QueryBindings) => void): StorageObservation;
}
