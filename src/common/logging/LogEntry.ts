/**
 * A single recorded log line.
 *
 * Persisted as plain JSON in device-local storage, so every field must be serializable. That is why
 * a thrown value is flattened into a `detail` string at capture time rather than kept as an Error
 * (an Error does not survive `structuredClone`/JSON round-tripping through chrome.storage).
 */
export type LogLevel = "info" | "error";

export interface LogEntry {
  /** Epoch milliseconds. Stored as a number (not a formatted string) so the view can sort and
   *  reformat it; the Diagnostics view orders lines by this value. */
  timestamp: number;
  level: LogLevel;
  message: string;
  /** Serialized error/stack for error entries; absent for plain messages. */
  detail?: string;
}

/**
 * Upper bound on retained entries. The oldest are dropped first so the local log cannot grow without
 * bound — chrome.storage.local is finite and the log is only a rolling diagnostic aid, not an audit
 * trail.
 */
export const MAX_LOG_ENTRIES = 500;

/** Flatten an unknown thrown value into a stable, human-readable detail string. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    // The stack already includes the name and message; fall back to name+message when absent.
    return error.stack && error.stack.length > 0 ? error.stack : `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    // A circular or otherwise non-serializable value still deserves a best-effort description.
    return String(error);
  }
}

/** ISO-8601 UTC so the format is stable and locale/timezone-independent (deterministic in tests). */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/** Format one entry as text for export and for the plain-text view. Detail lines are indented so a
 *  multi-line stack stays visually attached to its message. */
export function formatLogEntry(entry: LogEntry): string {
  const level = entry.level === "error" ? "ERROR" : "INFO";
  const base = `[${formatTimestamp(entry.timestamp)}] ${level} ${entry.message}`;
  if (entry.detail === undefined) {
    return base;
  }
  return `${base}\n    ${entry.detail.replace(/\n/g, "\n    ")}`;
}

/** Return entries ordered oldest → newest. `Array.prototype.sort` is stable, so equal timestamps
 *  keep their insertion order. */
export function orderByTimestamp(entries: readonly LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => a.timestamp - b.timestamp);
}

/** Validate and coerce a raw stored value into a clean list, dropping anything malformed so a
 *  corrupt entry can never crash the reader (forward/backward compatible). */
export function normalizeLogEntries(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: LogEntry[] = [];
  for (const item of raw) {
    const entry = normalizeLogEntry(item);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}

function normalizeLogEntry(raw: unknown): LogEntry | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const { timestamp, level, message, detail } = candidate;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return null;
  }
  if (level !== "info" && level !== "error") {
    return null;
  }
  if (typeof message !== "string") {
    return null;
  }
  const entry: LogEntry = { timestamp, level, message };
  if (typeof detail === "string") {
    entry.detail = detail;
  }
  return entry;
}
