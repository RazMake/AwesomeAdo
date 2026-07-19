import type { StorageObservation } from "../browser/observeSyncKeys";

import type { ExtensionSettings } from "./ExtensionSettings";

/**
 * Abstraction over persisted, browser-synced settings.
 *
 * Features depend on THIS, never on chrome.storage directly (Dependency Inversion),
 * which is what makes them unit-testable with a fake store.
 */
export interface ISettingsStore {
  /** Read the current settings, normalized to a complete object. */
  read(): Promise<ExtensionSettings>;

  /** Persist a partial update; unspecified fields keep their stored value. */
  write(update: Partial<ExtensionSettings>): Promise<void>;

  /**
   * Subscribe before reading, then emit the initial snapshot unless a newer event wins the race.
   * `unsubscribe` is available immediately; `ready` rejects if the initial read fails.
   */
  observe(listener: (settings: ExtensionSettings) => void): StorageObservation;
}
