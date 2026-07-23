import type { IBrowserKeyValueStorage } from "./IBrowserKeyValueStorage";

/**
 * Device-local key/value storage (backed by chrome.storage.local).
 *
 * A distinct name for the shared key/value contract so consumers state that they depend on the
 * *device-local* area. Local storage NEVER syncs across a user's browsers — it backs data that must
 * stay on the device, such as the diagnostics log.
 */
export type IBrowserLocalStorage = IBrowserKeyValueStorage;
