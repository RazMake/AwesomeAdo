import type { IBrowserLocalStorage } from "./IBrowserLocalStorage";
import { onStorageAreaChange } from "./onStorageAreaChange";

/**
 * IBrowserLocalStorage backed by chrome.storage.local.
 *
 * This is the only place that reads/writes chrome.storage.local, keeping device-local data (the
 * diagnostics log) isolated behind an injectable abstraction. Unlike chrome.storage.sync, this area
 * never leaves the device, which is why the log lives here rather than in synced storage.
 */
export class ChromeLocalStorage implements IBrowserLocalStorage {
  async get(key: string): Promise<unknown> {
    const bag = await chrome.storage.local.get(key);
    return bag[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  subscribe(key: string, listener: (value: unknown) => void): () => void {
    return onStorageAreaChange("local", key, listener);
  }
}
