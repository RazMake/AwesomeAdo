import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import type { ILogger } from "../logging/ILogger";

const TEAM_CONFIG_WORK_ITEM_KEY = "teamConfig.workItemId";

/** The trusted work item locator used to pull and publish team configuration. */
export interface TeamConfigSourceStore {
  read(): Promise<number | null>;
  write(workItemId: number | null): Promise<void>;
}

/** Persists the shared configuration work item id without mixing it into the downloaded payload. */
export class BrowserSyncTeamConfigSourceStore implements TeamConfigSourceStore {
  constructor(
    private readonly storage: IBrowserSyncStorage,
    private readonly logger?: ILogger,
  ) {}

  async read(): Promise<number | null> {
    return normalizeWorkItemId(await this.storage.get(TEAM_CONFIG_WORK_ITEM_KEY));
  }

  async write(workItemId: number | null): Promise<void> {
    const normalized = normalizeWorkItemId(workItemId);
    await this.storage.set(TEAM_CONFIG_WORK_ITEM_KEY, normalized);
    this.logger?.info(
      normalized === null ? "Team configuration disconnected" : "Team configuration connected",
    );
  }
}

/** ADO work item ids are positive safe integers. */
export function normalizeWorkItemId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
