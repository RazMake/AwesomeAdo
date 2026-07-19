import { ChromeSyncStorage } from "../browser/ChromeSyncStorage";

import { BrowserSyncQueryBindingStore } from "./BrowserSyncQueryBindingStore";
import type { IQueryBindingStore } from "./IQueryBindingStore";

/**
 * Composition root for the query-binding stack. Features call this instead of constructing the
 * concrete chrome-backed objects themselves, keeping the wiring in exactly one place.
 */
export function createQueryBindingStore(): IQueryBindingStore {
  return new BrowserSyncQueryBindingStore(new ChromeSyncStorage());
}
