import { ChromeLocalStorage } from "../browser/ChromeLocalStorage";

import { BrowserLocalLogStore } from "./BrowserLocalLogStore";
import type { ILogStore } from "./ILogStore";
import type { ILoggerFactory } from "./ILoggerFactory";
import { LoggerFactory } from "./LoggerFactory";

/**
 * Composition root for the logging stack. Features call these instead of constructing the concrete
 * chrome-backed objects themselves, keeping the wiring in exactly one place (Dependency Inversion).
 */

/**
 * Build a source-logger factory and its backing store sharing one BrowserLocalLogStore instance.
 * Used by the options page, where the same context both writes log lines (through several
 * source-scoped loggers) and shows them in Diagnostics.
 */
export function createLogging(): { loggers: ILoggerFactory; logStore: ILogStore } {
  const store = new BrowserLocalLogStore(new ChromeLocalStorage());
  return { loggers: new LoggerFactory(store), logStore: store };
}

/** Build a source-logger factory only, for contexts that produce log lines but never display them
 *  (background, content script). All contexts persist to the same device-local key, so the options
 *  page's Diagnostics view still sees background and content lines. */
export function createLoggerFactory(): ILoggerFactory {
  return createLogging().loggers;
}
