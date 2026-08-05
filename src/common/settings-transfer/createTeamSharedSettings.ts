import type { IQueryBindingStore } from "../bindings/IQueryBindingStore";
import type { ILogger } from "../logging/ILogger";
import type { ISettingsStore } from "../settings/ISettingsStore";
import { localSettingsAccess, type LocalSettingsAccess } from "../settings/LocalSettingsAccess";

import { personalSettingsStore, type IPersonalSettingsStore } from "./IPersonalSettingsStore";
import type { ITeamPublishingSettingsStore } from "./ITeamPublishingSettingsStore";
import type { TeamConfigSourceStore } from "./TeamConfigSourceStore";
import {
  TeamConfigSynchronizer,
  type TeamConfigReader,
  type TeamConfigWriter,
} from "./TeamConfigSynchronizer";
import { TeamSharedSettingsStore } from "./TeamSharedSettingsStore";

export interface TeamSharedSettingsOptions {
  settings: ISettingsStore;
  bindings: IQueryBindingStore;
  source: TeamConfigSourceStore;
  client: TeamConfigReader & TeamConfigWriter;
  logger: ILogger;
}

export interface TeamSharedSettings {
  /** The store for the team's configuration; every write reaches the team work item first. */
  settings: ITeamPublishingSettingsStore;
  /** The store for the settings that stay the reader's own (`PERSONAL_SETTING_KEYS`). */
  personal: IPersonalSettingsStore;
  synchronizer: TeamConfigSynchronizer;
  /** The named local-only path, for the pull and file-import flows that must not publish. */
  local: LocalSettingsAccess;
}

/**
 * Assemble the settings stack a connected page uses.
 *
 * Callers pass the plain store in and never bind it themselves, so the only stores in scope are the
 * two that say what they are: `settings` publishes to the team, `personal` does not. That is what
 * keeps this class of bug out — an edit cannot be wired to storage directly and then be undone by
 * the pull it raced, and a personal preference cannot be published to a teammate.
 */
export function createTeamSharedSettings(options: TeamSharedSettingsOptions): TeamSharedSettings {
  const local = localSettingsAccess(options.settings);
  const synchronizer = new TeamConfigSynchronizer(
    options.source,
    options.client,
    local,
    options.bindings,
    options.logger,
  );
  return {
    settings: new TeamSharedSettingsStore(
      options.settings,
      synchronizer,
      options.client,
      options.logger,
    ),
    personal: personalSettingsStore(options.settings),
    synchronizer,
    local,
  };
}
