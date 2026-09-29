import type { IBrowserKeyValueStorage } from "./IBrowserKeyValueStorage";

/**
 * Per-browser-session key/value storage (backed by chrome.storage.session).
 *
 * This distinct name makes worker-only consumers explicit: session data survives MV3 worker
 * restarts but clears when the browser closes, so it neither persists on disk nor syncs.
 */
export type IBrowserSessionStorage = IBrowserKeyValueStorage;
