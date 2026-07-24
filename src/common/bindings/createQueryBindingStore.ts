import { ChromeSyncStorage } from "../browser/ChromeSyncStorage";
import type { ILogger } from "../logging/ILogger";

import { BrowserSyncQueryBindingStore } from "./BrowserSyncQueryBindingStore";
import type { IQueryBindingStore } from "./IQueryBindingStore";

/**
 * Composition root for the query-binding stack. Features call this instead of constructing the
 * concrete chrome-backed objects themselves, keeping the wiring in exactly one place. Pass a logger
 * (sourced to the store class) so binding state transitions land in the Diagnostics log.
 */
export function createQueryBindingStore(logger?: ILogger): IQueryBindingStore {
  return new BrowserSyncQueryBindingStore(new ChromeSyncStorage(), logger);
}
