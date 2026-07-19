import type { IBrowserSyncStorage } from "./IBrowserSyncStorage";

/** The handle returned by an active observation: a readiness promise plus a way to stop it. */
export interface StorageObservation {
  /** Resolves after the initial snapshot is delivered; rejects if the initial read fails. */
  ready: Promise<void>;
  /** Stop delivering snapshots and release the underlying storage subscriptions. */
  unsubscribe: () => void;
}

/**
 * Owns the one race-sensitive part of observing synced storage so no store has to re-implement it.
 *
 * The protocol: subscribe to every key BEFORE the initial read, accumulate the latest raw value of
 * each key, and project the accumulated record into a complete snapshot. A revision counter lets a
 * change that lands *during* the initial read win — the initial read never clobbers a fresher live
 * value, and the initial emit is skipped when a change already emitted a newer snapshot. If the
 * initial read fails, the subscriptions are released and the error is rethrown through `ready`.
 *
 * Centralizing this here is why the settings store and the bindings store cannot silently drift on
 * this logic. `project` maps the accumulated key→value record into the snapshot type and must be
 * pure (it is called on every change and on the initial read).
 */
export function observeSyncKeys<T>(
  storage: IBrowserSyncStorage,
  keys: readonly string[],
  project: (raw: Record<string, unknown>) => T,
  listener: (value: T) => void,
): StorageObservation {
  let active = true;
  let revision = 0;
  const raw: Record<string, unknown> = {};
  const emit = (): void => {
    if (active) {
      listener(project(raw));
    }
  };
  const stops = keys.map((key) =>
    storage.subscribe(key, (value) => {
      raw[key] = value;
      revision += 1;
      emit();
    }),
  );
  const readRevision = revision;
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
      // Skip the initial emit if any change already emitted a newer snapshot during the read.
      if (active && revision === readRevision) {
        emit();
      }
    })
    .catch((error: unknown) => {
      unsubscribe();
      throw error;
    });
  return { ready, unsubscribe };
}
