import { ChromeSyncStorage } from "../browser/ChromeSyncStorage";

import { BrowserSyncSettingsStore } from "./BrowserSyncSettingsStore";
import type { ISettingsStore } from "./ISettingsStore";

/**
 * Composition root for the settings stack. Features call this instead of constructing the
 * concrete chrome-backed objects themselves, keeping the wiring in exactly one place.
 */
export function createSettingsStore(): ISettingsStore {
  return new BrowserSyncSettingsStore(new ChromeSyncStorage());
}
