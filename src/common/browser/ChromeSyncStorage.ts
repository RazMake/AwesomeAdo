import type { IBrowserSyncStorage } from "./IBrowserSyncStorage";

/**
 * IBrowserSyncStorage backed by chrome.storage.sync.
 *
 * This is the ONLY place allowed to reference the chrome.* storage API, so the rest of the code
 * stays testable and browser-agnostic. Chrome and Edge share this namespace.
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
    // Storage change events fire for every key; filter to the one we care about so callers
    // aren't woken up by unrelated writes.
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName === "sync" && key in changes) {
        listener(changes[key]?.newValue);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
}
