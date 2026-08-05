import type { ExtensionSettings } from "./ExtensionSettings";
import type { ISettingsStore } from "./ISettingsStore";

/**
 * Settings access for the two flows that must reach storage **without** publishing: applying a
 * configuration pulled from the team work item, and applying a file the user imported.
 *
 * Deliberately not an `ISettingsStore`. Publishing one of these writes back would either echo the
 * snapshot just pulled or push the outgoing team's configuration into the work item an import is
 * moving away from, so the capability is separated rather than left to each caller to remember.
 */
export interface LocalSettingsAccess {
  read(): Promise<ExtensionSettings>;
  applyLocally(update: Partial<ExtensionSettings>): Promise<void>;
}

/** Adapt a plain settings store to the local-only contract. */
export function localSettingsAccess(store: ISettingsStore): LocalSettingsAccess {
  return {
    read: () => store.read(),
    applyLocally: (update) => store.write(update),
  };
}
