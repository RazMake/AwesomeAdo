import type { IBrowserSessionStorage } from "./IBrowserSessionStorage";
import { onStorageAreaChange } from "./onStorageAreaChange";

/**
 * IBrowserSessionStorage backed by chrome.storage.session.
 *
 * This is the only place that reads or writes session storage. Construct it only at a composition
 * root so feature code remains browser-agnostic and testable through its injected contract.
 */
export class ChromeSessionStorage implements IBrowserSessionStorage {
  async get(key: string): Promise<unknown> {
    const bag = await chrome.storage.session.get(key);
    return bag[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.session.set({ [key]: value });
  }

  subscribe(key: string, listener: (value: unknown) => void): () => void {
    return onStorageAreaChange("session", key, listener);
  }
}
