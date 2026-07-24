import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeSyncKeys, type StorageObservation } from "../browser/observeSyncKeys";
import type { ILogger } from "../logging/ILogger";

import type { IQueryBindingStore } from "./IQueryBindingStore";
import { normalizeBindings, type QueryBinding, type QueryBindings } from "./QueryBinding";

// Unlike scalar settings, bindings are a growing collection, so they share one synced key holding
// the whole map. That key is namespaced to avoid ever colliding with a per-setting key.
const BINDINGS_KEY = "bindings.queries";

/**
 * Maps the query-bindings collection onto a single synced storage key.
 *
 * Depends on the IBrowserSyncStorage abstraction (injected) rather than chrome.* so it can be
 * unit-tested with a fake. The optional logger's source names this class so every mutation of a
 * query's binding — the extension's core state transitions — is traceable in the Diagnostics log
 * regardless of which runtime context (content menu or options page) triggered it.
 * Lines are recorded only after the write resolves, so a logged transition always reflects a change
 * that actually persisted; a rejected write surfaces through the caller instead.
 */
export class BrowserSyncQueryBindingStore implements IQueryBindingStore {
  constructor(
    private readonly storage: IBrowserSyncStorage,
    private readonly logger?: ILogger,
  ) {}

  async read(): Promise<QueryBindings> {
    return normalizeBindings(await this.storage.get(BINDINGS_KEY));
  }

  async bind(queryId: string, binding: QueryBinding): Promise<void> {
    // Read-modify-write the whole map: a user binds their own queries one at a time, so racing
    // writes are rare and last-writer-wins is acceptable — worth it to keep the single-key contract.
    const current = await this.read();
    const replacing = current[queryId] !== undefined;
    await this.storage.set(BINDINGS_KEY, { ...current, [queryId]: binding });
    this.logger?.info(
      `${replacing ? "Rebound" : "Bound"} query ${queryId}: view=${binding.view}, active=${binding.active ?? "default"}`,
    );
  }

  async unbind(queryId: string): Promise<void> {
    // Same read-modify-write on the shared map. Rewriting without the key is how a single binding is
    // removed, since the storage layer only knows how to set a whole key's value.
    const current = await this.read();
    if (current[queryId] === undefined) {
      // No transition happened, so nothing is logged — the log only records real state changes.
      return;
    }
    const rest = { ...current };
    delete rest[queryId];
    await this.storage.set(BINDINGS_KEY, rest);
    this.logger?.info(`Unbound query ${queryId}: was view=${current[queryId].view}`);
  }

  async setActiveView(queryId: string, active: QueryBinding["active"]): Promise<void> {
    // Read-modify-write so the binding's other fields (view, properties, name) survive. Owning this
    // here keeps every mutation of the bindings map in the store, instead of re-deriving the
    // read-modify-write in the content script.
    const current = await this.read();
    const binding = current[queryId];
    if (binding === undefined) {
      return;
    }
    await this.storage.set(BINDINGS_KEY, { ...current, [queryId]: { ...binding, active } });
    this.logger?.info(
      `Switched query ${queryId} to ${active ?? "default"} view (from ${binding.active ?? "default"})`,
    );
  }

  observe(listener: (bindings: QueryBindings) => void): StorageObservation {
    // The subtle revision-guarded subscribe-then-read protocol lives in observeSyncKeys so this
    // store and the settings store share one tested implementation. Bindings live under a single
    // key, so the projection normalizes just that key's value.
    return observeSyncKeys(
      this.storage,
      [BINDINGS_KEY],
      (raw) => normalizeBindings(raw[BINDINGS_KEY]),
      listener,
    );
  }
}
