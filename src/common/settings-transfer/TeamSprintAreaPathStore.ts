import type { ILogger } from "../logging/ILogger";
import type { ISettingsStore } from "../settings/ISettingsStore";
import {
  normalizeSprintAreaPaths,
  type SprintAreaPathConfiguration,
  type SprintAreaPaths,
} from "../settings/SprintAreaPaths";

import type { TeamConfigSynchronizer, TeamConfigWriter } from "./TeamConfigSynchronizer";

/** Pulls shared selections before reads and serializes publish-after-save operations. */
export class TeamSprintAreaPathStore {
  private pendingSave: Promise<boolean> = Promise.resolve(true);

  constructor(
    private readonly settings: ISettingsStore,
    private readonly synchronizer: TeamConfigSynchronizer,
    private readonly writer: TeamConfigWriter,
    private readonly logger: ILogger,
  ) {}

  async read(): Promise<SprintAreaPathConfiguration> {
    await this.synchronizer.pull();
    try {
      const settings = await this.settings.read();
      return {
        sprintAreaPaths: normalizeSprintAreaPaths(settings.sprintAreaPaths),
      };
    } catch (error) {
      this.logger.error("Could not read Sprint area-path configuration", error);
      throw new Error("Could not read Sprint area-path configuration", { cause: error });
    }
  }

  save(sprintAreaPaths: SprintAreaPaths): Promise<boolean> {
    const normalized = normalizeSprintAreaPaths(sprintAreaPaths);
    const save = this.pendingSave.then(() => this.performSave(normalized));
    this.pendingSave = save;
    return save;
  }

  private async performSave(sprintAreaPaths: SprintAreaPaths): Promise<boolean> {
    try {
      await this.settings.write({ sprintAreaPaths });
      const result = await this.synchronizer.publish(this.writer);
      if (result.status === "published") return true;
      this.logger.error(`Sprint area-path publish did not complete: status=${result.status}.`);
      return false;
    } catch (error) {
      this.logger.error("Could not save Sprint area-path configuration", error);
      return false;
    }
  }
}
