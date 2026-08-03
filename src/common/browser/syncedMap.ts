import type { IBrowserKeyValueStorage } from "./IBrowserKeyValueStorage";

/**
 * Remove one entry from a collection that lives under a single storage key.
 *
 * Storage only knows how to set a whole key's value, so removing one entry always means
 * read-modify-write of the entire map. That protocol lives here rather than in each store: the
 * "nothing to remove, so write nothing" short-circuit is what keeps a no-op from emitting a storage
 * change event (and a log line) for a transition that never happened, and it must not drift between
 * the stores that rely on it.
 *
 * Returns the value that was removed, or `null` when the map held no such entry — so a caller can
 * log what it dropped without reading the map twice.
 */
export async function removeSyncedMapEntry<T>(
  storage: IBrowserKeyValueStorage,
  storageKey: string,
  current: Record<string, T>,
  entryKey: string,
): Promise<T | null> {
  const removed = current[entryKey];
  if (removed === undefined) {
    return null;
  }
  const rest = { ...current };
  delete rest[entryKey];
  await storage.set(storageKey, rest);
  return removed;
}
