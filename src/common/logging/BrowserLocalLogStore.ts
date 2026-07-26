import type { IBrowserLocalStorage } from "../browser/IBrowserLocalStorage";
import { observeStorageKeys, type StorageObservation } from "../browser/observeStorageKeys";

import type { ILogStore, ILogWriter } from "./ILogStore";
import { type LogEntry, MAX_LOG_ENTRIES, normalizeLogEntries } from "./LogEntry";

/** Single device-local key holding the whole rolling log as a JSON array. */
const LOG_KEY = "diagnostics.log";

/**
 * Persists the diagnostics log to device-local storage (never synced).
 *
 * Depends on the IBrowserLocalStorage abstraction (injected) rather than chrome.* so it is fully
 * unit-testable with a fake. Appends are serialized within this context so two rapid logs cannot
 * read-modify-write over each other and lose an entry; cross-context races (background vs content
 * vs options writing at the same instant) are accepted because logging is infrequent and
 * best-effort, and chrome.storage offers no atomic read-modify-write.
 */
export class BrowserLocalLogStore implements ILogWriter, ILogStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly storage: IBrowserLocalStorage) {}

  append(entry: LogEntry): Promise<void> {
    const run = this.writeChain.then(() => this.appendNow(entry));
    // Keep the chain alive after a rejection so one failed write does not wedge all later logging.
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  private async appendNow(entry: LogEntry): Promise<void> {
    const next = [...(await this.read()), entry];
    // Ring-buffer: drop the oldest so the log stays bounded.
    const trimmed =
      next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
    await this.storage.set(LOG_KEY, trimmed);
  }

  async read(): Promise<LogEntry[]> {
    return normalizeLogEntries(await this.storage.get(LOG_KEY));
  }

  clear(): Promise<void> {
    // Route through the same chain so a clear cannot interleave with an in-flight append.
    const run = this.writeChain.then(() => this.storage.set(LOG_KEY, []));
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  observe(listener: (entries: LogEntry[]) => void): StorageObservation {
    // Delegate the subscribe-before-read race to the one module that owns it, rather than keeping a
    // second hand-written copy of it here: local and synced storage share the same key-value
    // contract, so the protocol is identical and a divergent copy could only drift.
    return observeStorageKeys(
      this.storage,
      [LOG_KEY],
      (raw) => normalizeLogEntries(raw[LOG_KEY]),
      listener,
    );
  }
}
