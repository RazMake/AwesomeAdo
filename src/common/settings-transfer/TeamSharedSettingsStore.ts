import type { StorageObservation } from "../browser/observeStorageKeys";
import type { ILogger } from "../logging/ILogger";
import type { ExtensionSettings } from "../settings/ExtensionSettings";
import type { ISettingsStore } from "../settings/ISettingsStore";

import type { ITeamPublishingSettingsStore } from "./ITeamPublishingSettingsStore";
import type { TeamConfigSynchronizer, TeamConfigWriter } from "./TeamConfigSynchronizer";

/** Publishes each proposed settings change before exposing it through synced browser storage. */
export class TeamSharedSettingsStore implements ITeamPublishingSettingsStore {
  readonly publishesBeforeWrite = true as const;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly settings: ISettingsStore,
    private readonly synchronizer: TeamConfigSynchronizer,
    private readonly writer: TeamConfigWriter,
    private readonly logger: ILogger,
  ) {}

  read(): Promise<ExtensionSettings> {
    return this.settings.read();
  }

  write(update: Partial<ExtensionSettings>): Promise<void> {
    // Serializing proposals makes a rapid second edit read the first accepted local value instead of
    // publishing two snapshots derived from the same stale starting point.
    const operation = this.pendingWrite.then(() => this.publishThenApply(update));
    this.pendingWrite = operation.catch((error: unknown) => {
      this.logger.error("Could not save team-shared settings", error);
    });
    return operation;
  }

  observe(listener: (settings: ExtensionSettings) => void): StorageObservation {
    return this.settings.observe(listener);
  }

  private async publishThenApply(update: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.settings.read();
    const result = await this.synchronizer.publishSettings(this.writer, { ...current, ...update });
    if (result.status === "failed") {
      throw new Error(`Could not publish team configuration: ${result.error}`);
    }
    await this.settings.write(update);
  }
}
