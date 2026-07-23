import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeSyncKeys, type StorageObservation } from "../browser/observeSyncKeys";

import { normalizeSettings, type ExtensionSettings } from "./ExtensionSettings";
import type { ISettingsStore } from "./ISettingsStore";

const THEME_KEY = "settings.theme";
const DEFAULT_VIEW_KEY = "settings.defaultView";
const CURRENT_TEAM_KEY = "settings.currentTeam";
const FUTURE_SPRINTS_KEY = "settings.futureSprintsCount";
const AREA_PATHS_KEY = "settings.areaPaths";
const BOARD_COLUMNS_KEY = "settings.boardColumns";
const WORK_ITEM_TYPES_KEY = "settings.workItemTypes";

const SETTING_KEYS = [
  THEME_KEY,
  DEFAULT_VIEW_KEY,
  CURRENT_TEAM_KEY,
  FUTURE_SPRINTS_KEY,
  AREA_PATHS_KEY,
  BOARD_COLUMNS_KEY,
  WORK_ITEM_TYPES_KEY,
] as const;

/** Project a raw key→value record from storage into the shape `normalizeSettings` expects. */
function projectSettings(raw: Record<string, unknown>): ExtensionSettings {
  return normalizeSettings({
    theme: raw[THEME_KEY],
    defaultView: raw[DEFAULT_VIEW_KEY],
    currentTeam: raw[CURRENT_TEAM_KEY],
    futureSprintsCount: raw[FUTURE_SPRINTS_KEY],
    areaPaths: raw[AREA_PATHS_KEY],
    boardColumns: raw[BOARD_COLUMNS_KEY],
    workItemTypes: raw[WORK_ITEM_TYPES_KEY],
  });
}

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
    const values = await Promise.all(SETTING_KEYS.map((key) => this.storage.get(key)));
    const raw: Record<string, unknown> = {};
    SETTING_KEYS.forEach((key, index) => {
      raw[key] = values[index];
    });
    return projectSettings(raw);
  }

  async write(update: Partial<ExtensionSettings>): Promise<void> {
    const writes: Promise<void>[] = [];
    if (update.theme !== undefined) {
      writes.push(this.storage.set(THEME_KEY, update.theme));
    }
    if (update.defaultView !== undefined) {
      writes.push(this.storage.set(DEFAULT_VIEW_KEY, update.defaultView));
    }
    if (update.currentTeam !== undefined) {
      writes.push(this.storage.set(CURRENT_TEAM_KEY, update.currentTeam));
    }
    if (update.futureSprintsCount !== undefined) {
      writes.push(this.storage.set(FUTURE_SPRINTS_KEY, update.futureSprintsCount));
    }
    if (update.areaPaths !== undefined) {
      writes.push(this.storage.set(AREA_PATHS_KEY, update.areaPaths));
    }
    if (update.boardColumns !== undefined) {
      writes.push(this.storage.set(BOARD_COLUMNS_KEY, update.boardColumns));
    }
    if (update.workItemTypes !== undefined) {
      writes.push(this.storage.set(WORK_ITEM_TYPES_KEY, update.workItemTypes));
    }
    await Promise.all(writes);
  }

  observe(listener: (settings: ExtensionSettings) => void): StorageObservation {
    // The subtle revision-guarded subscribe-then-read protocol lives in observeSyncKeys so the
    // settings store and the bindings store share one tested implementation. Each setting has its
    // own key, so a change to one still emits a complete snapshot built from all of them.
    return observeSyncKeys(this.storage, SETTING_KEYS, projectSettings, listener);
  }
}
