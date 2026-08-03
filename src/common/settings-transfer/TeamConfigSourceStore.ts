import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import { observeStorageKeys, type StorageObservation } from "../browser/observeStorageKeys";
import type { ILogger } from "../logging/ILogger";

const TEAM_CONFIG_WORK_ITEM_KEY = "teamConfig.workItemId";

/** The trusted work item locator used to pull and publish team configuration. */
export interface TeamConfigSourceStore {
  read(): Promise<number | null>;
  write(workItemId: number | null): Promise<void>;
}

/**
 * Kept separate from {@link TeamConfigSourceStore} (Interface Segregation) because only the options
 * page needs to follow the connection live; the pull/publish collaborators that read it once per
 * operation must not be forced to implement a subscription they never use.
 */
export interface ObservableTeamConfigSource {
  /**
   * Subscribe before reading, then emit the initial snapshot unless a newer event wins the race.
   * `unsubscribe` is available immediately; `ready` rejects if the initial read fails.
   */
  observe(listener: (workItemId: number | null) => void): StorageObservation;
}

/** Persists the shared configuration work item id without mixing it into the downloaded payload. */
export class BrowserSyncTeamConfigSourceStore
  implements TeamConfigSourceStore, ObservableTeamConfigSource
{
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

  observe(listener: (workItemId: number | null) => void): StorageObservation {
    return observeStorageKeys(
      this.storage,
      [TEAM_CONFIG_WORK_ITEM_KEY],
      (raw) => normalizeWorkItemId(raw[TEAM_CONFIG_WORK_ITEM_KEY]),
      listener,
    );
  }
}

/** ADO work item ids are positive safe integers. */
export function normalizeWorkItemId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
