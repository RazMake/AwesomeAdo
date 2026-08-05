import type { ExtensionSettings } from "../settings/ExtensionSettings";
import type { ISettingsStore } from "../settings/ISettingsStore";

/**
 * A settings store for the values that belong to the person rather than the team.
 *
 * The counterpart of `ITeamPublishingSettingsStore`, and mutually exclusive with it: a control edits
 * either the team's configuration or the reader's own, and saying which is not left to memory. Writes
 * still reach synced storage, so a personal setting follows the user across their own devices.
 */
export interface IPersonalSettingsStore extends ISettingsStore {
  readonly publishesBeforeWrite: false;
}

/** Mark a plain store as the personal one. Delegates rather than spreads, which drops prototypes. */
export function personalSettingsStore(store: ISettingsStore): IPersonalSettingsStore {
  return {
    publishesBeforeWrite: false,
    read: () => store.read(),
    write: (update: Partial<ExtensionSettings>) => store.write(update),
    observe: (listener: (settings: ExtensionSettings) => void) => store.observe(listener),
  };
}
