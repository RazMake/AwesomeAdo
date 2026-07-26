import type { IBrowserKeyValueStorage } from "./IBrowserKeyValueStorage";

/** The handle returned by an active observation: a readiness promise plus a way to stop it. */
export interface StorageObservation {
  /** Resolves after the initial snapshot is delivered; rejects if the initial read fails. */
  ready: Promise<void>;
  /** Stop delivering snapshots and release the underlying storage subscriptions. */
  unsubscribe: () => void;
}

/**
 * Owns the one race-sensitive part of observing browser storage so no store has to re-implement it.
 *
 * The protocol: subscribe to every key BEFORE the initial read, accumulate the latest raw value of
 * each key, and project the accumulated record into a complete snapshot. A change that lands
 * *during* the initial read wins, because the read only fills a key it has not already seen — so by
 * the time the reads settle, `raw` holds the freshest known value for every key and the post-read
 * emit is never stale. It is emitted unconditionally: skipping it whenever any key changed mid-read
 * would strand every OTHER key at the projection's default, since the change-driven emit fires
 * before the reads have filled them in. If the initial read fails, the subscriptions are released
 * and the error is rethrown through `ready`.
 *
 * Centralizing this here is why the settings store, the bindings store and the diagnostics log
 * cannot silently drift on this logic. It is typed against `IBrowserKeyValueStorage` rather than the
 * synced or local alias so every store can share it — the race is a property of the
 * subscribe-then-read protocol, not of which storage area is behind it. `project` maps the
 * accumulated key→value record into the snapshot type and must be pure (it is called on every change
 * and on the initial read).
 */
export function observeStorageKeys<T>(
  storage: IBrowserKeyValueStorage,
  keys: readonly string[],
  project: (raw: Record<string, unknown>) => T,
  listener: (value: T) => void,
): StorageObservation {
  let active = true;
  const raw: Record<string, unknown> = {};
  const emit = (): void => {
    if (active) {
      listener(project(raw));
    }
  };
  const stops = keys.map((key) =>
    storage.subscribe(key, (value) => {
      raw[key] = value;
      emit();
    }),
  );
  const unsubscribe = (): void => {
    if (active) {
      active = false;
      for (const stop of stops) {
        stop();
      }
    }
  };
  const ready = Promise.all(
    keys.map((key) =>
      storage.get(key).then((value) => {
        // A live change during the read already recorded a fresher value for this key; keep it.
        if (!(key in raw)) {
          raw[key] = value;
        }
      }),
    ),
  )
    .then(() => {
      emit();
    })
    .catch((error: unknown) => {
      unsubscribe();
      throw error;
    });
  return { ready, unsubscribe };
}
