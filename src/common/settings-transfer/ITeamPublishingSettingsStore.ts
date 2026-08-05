import type { ISettingsStore } from "../settings/ISettingsStore";

/**
 * A settings store whose every write reaches the connected team work item before it becomes visible
 * locally.
 *
 * The marker exists so the distinction is one the compiler can see: a plain `ISettingsStore` is
 * structurally identical, so a control that must publish would otherwise accept the local-only store
 * and silently lose each edit to the next pull.
 */
export interface ITeamPublishingSettingsStore extends ISettingsStore {
  readonly publishesBeforeWrite: true;
}
