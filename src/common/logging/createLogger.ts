import { ChromeLocalStorage } from "../browser/ChromeLocalStorage";

import { BrowserLocalLogStore } from "./BrowserLocalLogStore";
import type { ILogStore } from "./ILogStore";
import type { ILogger } from "./ILogger";
import { Logger } from "./Logger";

/**
 * Composition root for the logging stack. Features call these instead of constructing the concrete
 * chrome-backed objects themselves, keeping the wiring in exactly one place (Dependency Inversion).
 */

/**
 * Build a logger and its backing store sharing one BrowserLocalLogStore instance. Used by the
 * options page, where the same context both writes log lines and shows them in Diagnostics.
 */
export function createLogging(): { logger: ILogger; logStore: ILogStore } {
  const store = new BrowserLocalLogStore(new ChromeLocalStorage());
  return { logger: new Logger(store), logStore: store };
}

/** Build a logger only, for contexts that produce log lines but never display them (background,
 *  content script). */
export function createLogger(): ILogger {
  return createLogging().logger;
}
