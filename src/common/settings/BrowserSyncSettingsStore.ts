import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeSyncKeys, type StorageObservation } from "../browser/observeSyncKeys";

import { normalizeSettings, type ExtensionSettings } from "./ExtensionSettings";
import type { ISettingsStore } from "./ISettingsStore";

const THEME_KEY = "settings.theme";
const DEFAULT_VIEW_KEY = "settings.defaultView";

/**
 * Maps each setting onto its own synced storage key.
 *
 * Depends on the IBrowserSyncStorage abstraction (injected) rather than chrome.* so it can be
 * unit-tested with a fake. Per-setting keys prevent an older extension version from deleting
 * settings introduced by a newer version during a read-modify-write cycle.
 */
export class BrowserSyncSettingsStore implements ISettingsStore {
  constructor(private readonly storage: IBrowserSyncStorage) {}

  async read(): Promise<ExtensionSettings> {
    const [theme, defaultView] = await Promise.all([
      this.storage.get(THEME_KEY),
      this.storage.get(DEFAULT_VIEW_KEY),
    ]);
    return normalizeSettings({ theme, defaultView });
  }

  async write(update: Partial<ExtensionSettings>): Promise<void> {
    const writes: Promise<void>[] = [];
    if (update.theme !== undefined) {
      writes.push(this.storage.set(THEME_KEY, update.theme));
    }
    if (update.defaultView !== undefined) {
      writes.push(this.storage.set(DEFAULT_VIEW_KEY, update.defaultView));
    }
    await Promise.all(writes);
  }

  observe(listener: (settings: ExtensionSettings) => void): StorageObservation {
    // The subtle revision-guarded subscribe-then-read protocol lives in observeSyncKeys so the
    // settings store and the bindings store share one tested implementation. Each setting has its
    // own key, so a change to one still emits a complete snapshot built from all of them.
    return observeSyncKeys(
      this.storage,
      [THEME_KEY, DEFAULT_VIEW_KEY],
      (raw) => normalizeSettings({ theme: raw[THEME_KEY], defaultView: raw[DEFAULT_VIEW_KEY] }),
      listener,
    );
  }
}
