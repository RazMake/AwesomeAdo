import { ChromeSyncStorage } from "../browser/ChromeSyncStorage";
import type { ILogger } from "../logging/ILogger";

import {
  BrowserSyncTeamConfigSourceStore,
  type TeamConfigSourceStore,
} from "./TeamConfigSourceStore";

/** Composition root for the separately persisted team configuration source. */
export function createTeamConfigSourceStore(logger?: ILogger): TeamConfigSourceStore {
  return new BrowserSyncTeamConfigSourceStore(new ChromeSyncStorage(), logger);
}
