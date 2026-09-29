import type { RemovedFavorite } from "./Favorites";
import type { IBrowserSessionStorage } from "./IBrowserSessionStorage";

export interface RemovedFavoritesRecord {
  syncId: string;
  queryId: string;
  folderId: string;
  path: string;
  removed: readonly RemovedFavorite[];
}

export interface RemovedFavoritesRecords {
  read(queryId: string): Promise<RemovedFavoritesRecord | null>;
  write(record: RemovedFavoritesRecord): Promise<void>;
  forget(queryId: string): Promise<void>;
}

/**
 * Per-catalog session records used to restore Favorites removed by the most recent sync.
 *
 * Records are intentionally popup-only undo data: a later sync replaces them and closing the
 * browser clears them. Only the worker reads complete records; content code sends back only ids.
 */
export class SessionRemovedFavoritesRecords implements RemovedFavoritesRecords {
  constructor(private readonly storage: IBrowserSessionStorage) {}

  async read(queryId: string): Promise<RemovedFavoritesRecord | null> {
    const value = await this.storage.get(recordKey(queryId));
    return isRemovedFavoritesRecord(value, queryId) ? copyRecord(value) : null;
  }

  async write(record: RemovedFavoritesRecord): Promise<void> {
    await this.storage.set(recordKey(record.queryId), copyRecord(record));
  }

  async forget(queryId: string): Promise<void> {
    await this.storage.set(recordKey(queryId), null);
  }
}

function recordKey(queryId: string): string {
  return `catalogFavorites.removed.${queryId}`;
}

function isRemovedFavoritesRecord(
  value: unknown,
  queryId: string,
): value is RemovedFavoritesRecord {
  if (!isObject(value) || value.queryId !== queryId || !Array.isArray(value.removed)) return false;

  return (
    typeof value.syncId === "string" &&
    typeof value.folderId === "string" &&
    typeof value.path === "string" &&
    value.removed.every(isRemovedFavorite)
  );
}

function isRemovedFavorite(value: unknown): value is RemovedFavorite {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.url === "string"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyRecord(record: RemovedFavoritesRecord): RemovedFavoritesRecord {
  return {
    syncId: record.syncId,
    queryId: record.queryId,
    folderId: record.folderId,
    path: record.path,
    removed: record.removed.map(copyRemovedFavorite),
  };
}

function copyRemovedFavorite(favorite: RemovedFavorite): RemovedFavorite {
  return { id: favorite.id, title: favorite.title, url: favorite.url };
}
