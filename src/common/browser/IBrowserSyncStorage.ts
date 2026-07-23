import type { IBrowserKeyValueStorage } from "./IBrowserKeyValueStorage";

/**
 * Synced key/value storage (backed by chrome.storage.sync).
 *
 * A distinct name for the shared key/value contract so consumers state that they depend on the
 * *synced* area — data that follows the user across their signed-in browsers.
 */
export type IBrowserSyncStorage = IBrowserKeyValueStorage;
