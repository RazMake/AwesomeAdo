import { ChromeSyncStorage } from "../browser/ChromeSyncStorage";
import type { ILogger } from "../logging/ILogger";

import { BrowserSyncSettingsStore } from "./BrowserSyncSettingsStore";
import type { ISettingsStore } from "./ISettingsStore";

/**
 * Composition root for the settings stack. Features call this instead of constructing the
 * concrete chrome-backed objects themselves, keeping the wiring in exactly one place. Pass a logger
 * (sourced to the store class) so configuration changes land in the Diagnostics log.
 */
export function createSettingsStore(logger?: ILogger): ISettingsStore {
  return new BrowserSyncSettingsStore(new ChromeSyncStorage(), logger);
}
