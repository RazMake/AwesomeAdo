import type { IBrowserSyncStorage } from "./IBrowserSyncStorage";
import { onStorageAreaChange } from "./onStorageAreaChange";

/**
 * IBrowserSyncStorage backed by chrome.storage.sync.
 *
 * This is the only place that reads/writes chrome.storage.sync, so the rest of the code stays
 * testable and browser-agnostic. Chrome and Edge share this synced namespace. Change subscriptions
 * are delegated to `onStorageAreaChange`, which the local adapter shares.
 */
export class ChromeSyncStorage implements IBrowserSyncStorage {
  async get(key: string): Promise<unknown> {
    const bag = await chrome.storage.sync.get(key);
    return bag[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.sync.set({ [key]: value });
  }

  subscribe(key: string, listener: (value: unknown) => void): () => void {
    return onStorageAreaChange("sync", key, listener);
  }
}
