import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeStorageKeys, type StorageObservation } from "../browser/observeStorageKeys";
import type { ILogger } from "../logging/ILogger";

import { normalizeSettings, type ExtensionSettings } from "./ExtensionSettings";
import type { ISettingsStore } from "./ISettingsStore";

const THEME_KEY = "settings.theme";
const DEFAULT_VIEW_KEY = "settings.defaultView";
const CURRENT_TEAM_KEY = "settings.currentTeam";
const FUTURE_SPRINTS_KEY = "settings.futureSprintsCount";
const PAST_SPRINTS_KEY = "settings.pastSprintsCount";
const SPRINT_AREA_PATHS_KEY = "settings.sprintAreaPaths";
const BOARD_COLUMNS_KEY = "settings.boardColumns";
const WORK_ITEM_TYPES_KEY = "settings.workItemTypes";
const MARKER_TAGS_KEY = "settings.markerTags";

const SETTING_KEYS = [
  THEME_KEY,
  DEFAULT_VIEW_KEY,
  CURRENT_TEAM_KEY,
  FUTURE_SPRINTS_KEY,
  PAST_SPRINTS_KEY,
  SPRINT_AREA_PATHS_KEY,
  BOARD_COLUMNS_KEY,
  WORK_ITEM_TYPES_KEY,
  MARKER_TAGS_KEY,
] as const;

// Pairs each writable setting with its own synced storage key. Driving the write from one table
// keeps the change detection uniform (and the log names accurate) without one branch per setting.
const SETTING_WRITE_MAP: readonly { name: keyof ExtensionSettings; key: string }[] = [
  { name: "theme", key: THEME_KEY },
  { name: "defaultView", key: DEFAULT_VIEW_KEY },
  { name: "currentTeam", key: CURRENT_TEAM_KEY },
  { name: "futureSprintsCount", key: FUTURE_SPRINTS_KEY },
  { name: "pastSprintsCount", key: PAST_SPRINTS_KEY },
  { name: "sprintAreaPaths", key: SPRINT_AREA_PATHS_KEY },
  { name: "boardColumns", key: BOARD_COLUMNS_KEY },
  { name: "workItemTypes", key: WORK_ITEM_TYPES_KEY },
  { name: "markerTags", key: MARKER_TAGS_KEY },
];

/** Project a raw key→value record from storage into the shape `normalizeSettings` expects. */
function projectSettings(raw: Record<string, unknown>): ExtensionSettings {
  return normalizeSettings({
    theme: raw[THEME_KEY],
    defaultView: raw[DEFAULT_VIEW_KEY],
    currentTeam: raw[CURRENT_TEAM_KEY],
    futureSprintsCount: raw[FUTURE_SPRINTS_KEY],
    pastSprintsCount: raw[PAST_SPRINTS_KEY],
    sprintAreaPaths: raw[SPRINT_AREA_PATHS_KEY],
    boardColumns: raw[BOARD_COLUMNS_KEY],
    workItemTypes: raw[WORK_ITEM_TYPES_KEY],
    markerTags: raw[MARKER_TAGS_KEY],
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
 * ADO organisation or team.
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
    // without ever recording the value — values can contain the user's org/team names.
    const changes: { name: keyof ExtensionSettings; write: Promise<void> }[] = [];
    for (const { name, key } of SETTING_WRITE_MAP) {
      const value = update[name];
      if (value !== undefined) {
        changes.push({ name, write: this.storage.set(key, value) });
      }
    }
    await Promise.all(changes.map((change) => change.write));
    if (changes.length > 0) {
      this.logger?.info(`Settings saved: ${changes.map((change) => change.name).join(", ")}`);
    }
  }

  observe(listener: (settings: ExtensionSettings) => void): StorageObservation {
    // The subtle subscribe-then-read race protocol lives in observeStorageKeys so the
    // settings store and the bindings store share one tested implementation. Each setting has its
    // own key, so a change to one still emits a complete snapshot built from all of them.
    return observeStorageKeys(this.storage, SETTING_KEYS, projectSettings, listener);
  }
}
