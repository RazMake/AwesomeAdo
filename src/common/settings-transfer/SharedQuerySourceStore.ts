import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeStorageKeys, type StorageObservation } from "../browser/observeStorageKeys";
import { removeSyncedMapEntry } from "../browser/syncedMap";
import type { ILogger } from "../logging/ILogger";

import { normalizeWorkItemId } from "./TeamConfigSourceStore";

// A growing collection, so the whole map lives under one namespaced synced key — the same shape the
// bindings map uses, and for the same reason.
const SHARED_QUERY_SOURCES_KEY = "sharedQueries.workItemIds";

/**
 * Which configuration work item each read-only shared query reads from, keyed by ADO query id.
 *
 * This map exists only for queries whose configuration the user may NOT change: they were opened
 * from a shared link naming a team the user does not belong to. A query the user is a member-team
 * owner of is connected through `TeamConfigSourceStore` instead, because there the work item governs
 * the whole configuration rather than one query.
 */
export type SharedQuerySources = Record<string, number>;

/** The per-query read-only links to a shared configuration work item. */
export interface SharedQuerySourceStore {
  read(): Promise<SharedQuerySources>;
  /** Point one query at a configuration work item. Other queries are left untouched. */
  link(queryId: string, workItemId: number): Promise<void>;
  /** Drop one query's link. Other queries are left untouched; a no-op when it has none. */
  unlink(queryId: string): Promise<void>;
  /**
   * Subscribe before reading, then emit the initial snapshot unless a newer event wins the race.
   * `unsubscribe` is available immediately; `ready` rejects if the initial read fails.
   */
  observe(listener: (sources: SharedQuerySources) => void): StorageObservation;
}

/** Maps the read-only shared-query links onto a single synced storage key. */
export class BrowserSyncSharedQuerySourceStore implements SharedQuerySourceStore {
  constructor(
    private readonly storage: IBrowserSyncStorage,
    private readonly logger?: ILogger,
  ) {}

  async read(): Promise<SharedQuerySources> {
    return normalizeSharedQuerySources(await this.storage.get(SHARED_QUERY_SOURCES_KEY));
  }

  async link(queryId: string, workItemId: number): Promise<void> {
    const id = normalizeWorkItemId(workItemId);
    if (id === null) {
      return;
    }
    // Read-modify-write the whole map, like the bindings store: links are created one shared link at
    // a time, so last-writer-wins is acceptable and the single-key contract is worth keeping.
    const current = await this.read();
    if (current[queryId] === id) {
      // No transition happened, so nothing is written and nothing is logged.
      return;
    }
    await this.storage.set(SHARED_QUERY_SOURCES_KEY, { ...current, [queryId]: id });
    this.logger?.info(`Query ${queryId} now reads its configuration from work item ${id}`);
  }

  async unlink(queryId: string): Promise<void> {
    const removed = await removeSyncedMapEntry(
      this.storage,
      SHARED_QUERY_SOURCES_KEY,
      await this.read(),
      queryId,
    );
    if (removed !== null) {
      this.logger?.info(
        `Query ${queryId} no longer reads its configuration from work item ${removed}`,
      );
    }
  }

  observe(listener: (sources: SharedQuerySources) => void): StorageObservation {
    return observeStorageKeys(
      this.storage,
      [SHARED_QUERY_SOURCES_KEY],
      (raw) => normalizeSharedQuerySources(raw[SHARED_QUERY_SOURCES_KEY]),
      listener,
    );
  }
}

/**
 * Convert an unknown value read from synced storage into a usable link map.
 *
 * Entries that do not name a positive work item id are dropped rather than repaired: a link whose
 * source cannot be identified would leave its query claiming to be read-only with nothing to read.
 */
export function normalizeSharedQuerySources(raw: unknown): SharedQuerySources {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  // Prototype-less because the keys are query ids read straight from storage: assigning a
  // `__proto__` key onto a normal object literal invokes the Object.prototype setter instead of
  // adding an entry, which would silently drop that link.
  const result = Object.create(null) as SharedQuerySources;
  for (const [queryId, value] of Object.entries(raw)) {
    const workItemId = normalizeWorkItemId(value);
    if (queryId.length > 0 && workItemId !== null) {
      result[queryId] = workItemId;
    }
  }
  return result;
}
