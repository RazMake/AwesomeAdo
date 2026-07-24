import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeSyncKeys, type StorageObservation } from "../browser/observeSyncKeys";
import type { ILogger } from "../logging/ILogger";

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
 * settings introduced by a newer version during a read-modify-write cycle. The optional logger's
 * source names this class so each configuration change is traceable in the Diagnostics log; only the
 * names of the changed settings are recorded, never their values, so the log never leaks the user's
 * ADO organisation, area paths, or team.
 */
export class BrowserSyncSettingsStore implements ISettingsStore {
  constructor(
    private readonly storage: IBrowserSyncStorage,
    private readonly logger?: ILogger,
  ) {}

  async read(): Promise<ExtensionSettings> {
    const values = await Promise.all(SETTING_KEYS.map((key) => this.storage.get(key)));
    const raw: Record<string, unknown> = {};
    SETTING_KEYS.forEach((key, index) => {
      raw[key] = values[index];
    });
    return projectSettings(raw);
  }

  async write(update: Partial<ExtensionSettings>): Promise<void> {
    // Pair each changed setting with its write so the log can name exactly what changed (the signal)
    // without ever recording the value — values can contain the user's org/team/area-path names.
    const changes: { name: keyof ExtensionSettings; write: Promise<void> }[] = [];
    if (update.theme !== undefined) {
      changes.push({ name: "theme", write: this.storage.set(THEME_KEY, update.theme) });
    }
    if (update.defaultView !== undefined) {
      changes.push({
        name: "defaultView",
        write: this.storage.set(DEFAULT_VIEW_KEY, update.defaultView),
      });
    }
    if (update.currentTeam !== undefined) {
      changes.push({
        name: "currentTeam",
        write: this.storage.set(CURRENT_TEAM_KEY, update.currentTeam),
      });
    }
    if (update.futureSprintsCount !== undefined) {
      changes.push({
        name: "futureSprintsCount",
        write: this.storage.set(FUTURE_SPRINTS_KEY, update.futureSprintsCount),
      });
    }
    if (update.areaPaths !== undefined) {
      changes.push({
        name: "areaPaths",
        write: this.storage.set(AREA_PATHS_KEY, update.areaPaths),
      });
    }
    if (update.boardColumns !== undefined) {
      changes.push({
        name: "boardColumns",
        write: this.storage.set(BOARD_COLUMNS_KEY, update.boardColumns),
      });
    }
    if (update.workItemTypes !== undefined) {
      changes.push({
        name: "workItemTypes",
        write: this.storage.set(WORK_ITEM_TYPES_KEY, update.workItemTypes),
      });
    }
    await Promise.all(changes.map((change) => change.write));
    if (changes.length > 0) {
      this.logger?.info(`Settings saved: ${changes.map((change) => change.name).join(", ")}`);
    }
  }

  observe(listener: (settings: ExtensionSettings) => void): StorageObservation {
    // The subtle revision-guarded subscribe-then-read protocol lives in observeSyncKeys so the
    // settings store and the bindings store share one tested implementation. Each setting has its
    // own key, so a change to one still emits a complete snapshot built from all of them.
    return observeSyncKeys(this.storage, SETTING_KEYS, projectSettings, listener);
  }
}
