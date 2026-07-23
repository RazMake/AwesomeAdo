# src/common/logging

A small, device-local diagnostics log shared by every part of the extension (background service
worker, content script, and options page).

## Purpose

Give every component one way to record what happened — errors and the occasional informational
milestone — so failures are diagnosable after the fact. The log is **local only**: it is written to
`chrome.storage.local` and never synced to the user's other browsers, and it never leaves the
device. Errors are additionally mirrored to `console.error` so they stay visible in devtools.

Producers depend on the tiny `ILogger` interface; the Diagnostics view depends on `ILogStore`. The
two are separated (Interface Segregation) so a component that only records can neither read nor clear
the log.

## Public API

### `ILogger` (interface)

What feature code uses. Logging is fire-and-forget — it returns `void` and never throws, so a
logging failure can never break the feature that logged.

```typescript
interface ILogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}
```

- `info(message)` — record an informational line (persisted only; no console output).
- `error(message, error?)` — record an error line and mirror it to `console.error`. The optional
  thrown value is flattened into a stored `detail` string (stack when available).

### `LogEntry` / `LogLevel` — `LogEntry.ts`

The serializable shape of one recorded line, plus pure helpers used by the store and the view:

```typescript
type LogLevel = "info" | "error";
interface LogEntry {
  timestamp: number; // epoch ms; the view orders by this
  level: LogLevel;
  message: string;
  detail?: string; // serialized error/stack for error entries
}
```

- `describeError(error)` — flatten any thrown value into a stable detail string.
- `formatTimestamp(ms)` — ISO-8601 UTC (stable, locale-independent).
- `formatLogEntry(entry)` — one text line for export/plain-text display (detail indented).
- `orderByTimestamp(entries)` — non-mutating, stable oldest → newest sort.
- `normalizeLogEntries(raw)` — validate/coerce a raw stored value, dropping anything malformed.
- `MAX_LOG_ENTRIES` — the rolling-window cap (oldest dropped first).

### `ILogStore` / `ILogWriter` — `ILogStore.ts`

The read/manage side used by the Diagnostics view (`read`, `clear`, `observe`) and the append side
used by the logger (`append`). `observe` subscribes before its initial read, emits the current
entries, and re-emits on every change; its `StorageObservation` handle exposes `ready` and
`unsubscribe`.

## Composition roots

Chrome-backed objects are constructed only here (Dependency Inversion):

```typescript
import { createLogger, createLogging } from "./createLogger";

// Background & content: they only produce log lines.
const logger = createLogger();

// Options page: it both produces lines and displays them, so it needs the shared store too.
const { logger, logStore } = createLogging();
```

`createLogging()` builds one `BrowserLocalLogStore` over a `ChromeLocalStorage`, wraps it in a
`Logger`, and returns both — the logger writes and the Diagnostics view reads the same store.

## Usage guidance

- Feature classes depend on `ILogger` (injected). Never construct `Logger`/`BrowserLocalLogStore`
  outside a composition root.
- Do not log from render code that reacts to `ILogStore.observe` (e.g. the Diagnostics view): a log
  during render would feed the store it is observing and loop.
- Keep informational logging low-frequency. The log is a bounded ring buffer, so routine, high-churn
  events would push out the errors that matter.
- For tests, implement `ILogWriter`/`ILogStore` with an in-memory fake and inject a fixed clock into
  `Logger` for deterministic timestamps.
