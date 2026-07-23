import type { StorageObservation } from "../browser/observeSyncKeys";

import type { LogEntry } from "./LogEntry";

/**
 * The append side of the log, used by the Logger to persist one captured line.
 *
 * Segregated from ILogStore (Interface Segregation) so a log producer can only add entries — it can
 * neither read nor clear the log.
 */
export interface ILogWriter {
  append(entry: LogEntry): Promise<void>;
}

/**
 * The read/manage side of the log, used by the Diagnostics view to display, live-update, and clear
 * recorded entries. Kept separate from ILogWriter so producers and the viewer depend only on what
 * each needs.
 */
export interface ILogStore {
  /** Read all retained entries (unordered; the view sorts by timestamp). */
  read(): Promise<LogEntry[]>;

  /** Remove every entry. */
  clear(): Promise<void>;

  /**
   * Subscribe before reading, then emit the current entries; re-emit on every change. `unsubscribe`
   * is available immediately; `ready` rejects if the initial read fails.
   */
  observe(listener: (entries: LogEntry[]) => void): StorageObservation;
}
