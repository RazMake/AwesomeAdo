import type { IQueryBindingStore } from "../bindings/IQueryBindingStore";
import type { QueryBindings } from "../bindings/QueryBinding";
import type { ILogger } from "../logging/ILogger";
import type { ExtensionSettings } from "../settings/ExtensionSettings";
import { withoutPersonalSettings } from "../settings/ExtensionSettings";
import type { LocalSettingsAccess } from "../settings/LocalSettingsAccess";

import {
  ConfigImportError,
  exportCompactConfig,
  importConfig,
  mergeImportedSettings,
} from "./AwesomeAdoConfig";
import type { TeamConfigSourceStore } from "./TeamConfigSourceStore";

export type TeamConfigReadResult = { ok: true; text: string | null } | { ok: false; error: string };

export type TeamConfigWriteResult =
  { ok: true; workItemUrl?: string } | { ok: false; error: string };

export interface TeamConfigReader {
  read(workItemId: number): Promise<TeamConfigReadResult>;
}

export interface TeamConfigWriter {
  write(workItemId: number, text: string): Promise<TeamConfigWriteResult>;
}

export type TeamConfigSyncResult =
  | { status: "disconnected" }
  | { status: "empty"; workItemId: number }
  | { status: "unchanged"; workItemId: number; bindingCount: number }
  | { status: "updated"; workItemId: number; bindingCount: number }
  | { status: "published"; workItemId: number; workItemUrl?: string; bindingCount: number }
  | { status: "failed"; workItemId: number | null; error: string };

/** Pulls and publishes one authoritative full configuration without trusting it to choose its source. */
export class TeamConfigSynchronizer {
  private pullInFlight: Promise<TeamConfigSyncResult> | null = null;

  constructor(
    private readonly sourceStore: TeamConfigSourceStore,
    private readonly reader: TeamConfigReader,
    private readonly settings: LocalSettingsAccess,
    private readonly bindingStore: IQueryBindingStore,
    private readonly logger: ILogger,
  ) {}

  pull(): Promise<TeamConfigSyncResult> {
    if (this.pullInFlight !== null) {
      return this.pullInFlight;
    }
    this.pullInFlight = this.performPull().finally(() => {
      this.pullInFlight = null;
    });
    return this.pullInFlight;
  }

  async publish(writer: TeamConfigWriter): Promise<TeamConfigSyncResult> {
    return this.publishSnapshot(writer, this.settings.read(), this.bindingStore.read());
  }

  /** Publish proposed bindings before a caller exposes them locally to pull-triggered observers. */
  async publishBindings(
    writer: TeamConfigWriter,
    bindings: QueryBindings,
  ): Promise<TeamConfigSyncResult> {
    return this.publishSnapshot(writer, this.settings.read(), bindings);
  }

  /** Publish proposed settings before a caller exposes them locally to pull-triggered observers. */
  async publishSettings(
    writer: TeamConfigWriter,
    settings: ExtensionSettings,
  ): Promise<TeamConfigSyncResult> {
    return this.publishSnapshot(writer, settings, this.bindingStore.read());
  }

  private async publishSnapshot(
    writer: TeamConfigWriter,
    settings: ExtensionSettings | Promise<ExtensionSettings>,
    bindings: QueryBindings | Promise<QueryBindings>,
  ): Promise<TeamConfigSyncResult> {
    let workItemId: number | null = null;
    try {
      workItemId = await this.sourceStore.read();
      if (workItemId === null) {
        return { status: "disconnected" };
      }
      const [resolvedSettings, resolvedBindings] = await Promise.all([settings, bindings]);
      const result = await writer.write(
        workItemId,
        exportCompactConfig(resolvedSettings, resolvedBindings),
      );
      if (!result.ok) {
        throw new Error(result.error);
      }
      const bindingCount = Object.keys(resolvedBindings).length;
      this.logger.info(
        `Published team configuration from work item ${workItemId}: ${bindingCount} binding(s).`,
      );
      return {
        status: "published",
        workItemId,
        workItemUrl: result.workItemUrl,
        bindingCount,
      };
    } catch (error) {
      this.logger.error("Could not publish team configuration", error);
      return { status: "failed", workItemId, error: describeError(error) };
    }
  }

  private async performPull(): Promise<TeamConfigSyncResult> {
    let workItemId: number | null = null;
    try {
      workItemId = await this.sourceStore.read();
      if (workItemId === null) {
        return { status: "disconnected" };
      }
      const response = await this.reader.read(workItemId);
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (response.text === null) {
        return { status: "empty", workItemId };
      }
      const imported = importConfig(response.text);
      if (imported.problems.length > 0) {
        throw new ConfigImportError(imported.problems);
      }
      if (!imported.replacesBindings) {
        // A connection-only payload names a source; it never IS one. Adopting it would replace the
        // team's shared bindings with its empty set on every client that pulled it.
        throw new ConfigImportError([
          "The shared work item does not hold a complete AwesomeADO configuration.",
        ]);
      }
      const [currentSettings, currentBindings] = await Promise.all([
        this.settings.read(),
        this.bindingStore.read(),
      ]);
      // A payload published by an older build can still carry theme and default view; they belong to
      // whoever is reading, so they are dropped rather than applied over their own choice.
      const settingsUpdate = withoutPersonalSettings(
        mergeImportedSettings(currentSettings, imported),
      );
      const nextSettings = { ...currentSettings, ...settingsUpdate };
      const nextText = exportCompactConfig(nextSettings, imported.enhancedQueries);
      const bindingCount = Object.keys(imported.enhancedQueries).length;
      if (nextText === exportCompactConfig(currentSettings, currentBindings)) {
        return { status: "unchanged", workItemId, bindingCount };
      }
      await Promise.all([
        this.settings.applyLocally(settingsUpdate),
        this.bindingStore.replaceAll(imported.enhancedQueries),
      ]);
      this.logger.info(
        `Pulled team configuration from work item ${workItemId}: ${bindingCount} binding(s).`,
      );
      return { status: "updated", workItemId, bindingCount };
    } catch (error) {
      this.logger.error("Could not pull team configuration", error);
      return { status: "failed", workItemId, error: describeError(error) };
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
