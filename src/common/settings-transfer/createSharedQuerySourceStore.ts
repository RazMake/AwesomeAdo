import { ChromeSyncStorage } from "../browser/ChromeSyncStorage";
import type { ILogger } from "../logging/ILogger";

import {
  BrowserSyncSharedQuerySourceStore,
  type SharedQuerySourceStore,
} from "./SharedQuerySourceStore";

/** Composition root for the per-query read-only links to a shared configuration work item. */
export function createSharedQuerySourceStore(logger?: ILogger): SharedQuerySourceStore {
  return new BrowserSyncSharedQuerySourceStore(new ChromeSyncStorage(), logger);
}
