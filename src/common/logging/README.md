# src/common/logging

A small, device-local diagnostics log shared by every part of the extension (background service
worker, content script, and options page).

## Purpose

Give every part of the extension one way to record what happened — errors and the occasional
informational milestone — so failures are diagnosable after the fact. The log is **local only**: it
is written to `chrome.storage.local` and never synced to the user's other browsers, and it never
leaves the device. Errors are additionally mirrored to `console.error` so they stay visible in
devtools.

Every line is stamped with the **source** that produced it — by convention the component folder that
owns the emitting code (`content/query-page`, `common/settings`, `options/alerts`, …), or the runtime
context (`background`, `content`, `options`) for composition-root wiring that is not tied to one
subfolder. This component-folder breakdown lets the Diagnostics view group and filter lines down to
the feature area that produced them.

Producers depend on the tiny `ILogger` interface and obtain their source-scoped logger from an
`ILoggerFactory`; the Diagnostics view depends on `ILogStore`. The interfaces are separated
(Interface Segregation) so a source that only records can neither read nor clear the log.

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

Each `ILogger` is bound to one source, so callers never pass their own name — the logger stamps it on
every line and the `console.error` mirror is prefixed `AwesomeADO [source]:`.

### `ILoggerFactory` (interface) — `ILoggerFactory.ts`

How a composition root mints one source-scoped `ILogger` per component (or wiring context) from a
single shared writer, so all of a context's lines stay in one serialized append chain:

```typescript
interface ILoggerFactory {
  forSource(source: string): ILogger;
}
```

`source` is a free-form string by design (not a closed union): a component-folder breakdown would
otherwise need every folder enumerated in one place, and a new component must not have to edit a
shared registry to log. By convention pass the owning component folder path (a string literal, so
minification cannot rename it), or the runtime context for composition-root wiring.

### `LogEntry` / `LogLevel` — `LogEntry.ts`

The serializable shape of one recorded line, plus pure helpers used by the store and the view:

```typescript
type LogLevel = "info" | "error";
interface LogEntry {
  timestamp: number; // epoch ms; the view orders by this
  level: LogLevel;
  message: string;
  source?: string; // the producing component folder/context; the view groups/filters by this
  detail?: string; // serialized error/stack for error entries
}
```

`source` is optional so a line written by a newer extension version — carrying a source this build
has not heard of — still deserializes, and a legacy line persisted under the old `component` key is
read back into `source` so its origin is not lost after an upgrade. The Diagnostics view buckets any
line without a source under `(unlabeled)` so it stays filterable.

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
import { createLoggerFactory, createLogging } from "./createLogger";

// Background & content: they only produce log lines.
const loggers = createLoggerFactory();
const logger = loggers.forSource("content/query-page");

// Options page: it both produces lines and displays them, so it needs the shared store too.
const { loggers, logStore } = createLogging();
const logger = loggers.forSource("options");
```

`createLogging()` builds one `BrowserLocalLogStore` over a `ChromeLocalStorage`, wraps it in a
`LoggerFactory`, and returns both — the factory's source loggers write and the Diagnostics view reads
the same store. Because every context persists to the same device-local key, the options page's
Diagnostics view shows lines from every source across all contexts alongside its own, and its
searchable source filter offers a checkbox per source present.

## Usage guidance

- Feature classes depend on `ILogger` (injected) and are given a logger sourced to their owning
  component folder at the composition root. Never construct `Logger`/`BrowserLocalLogStore` outside a
  composition root.
- Do not log from render code that reacts to `ILogStore.observe` (e.g. the Diagnostics view): a log
  during render would feed the store it is observing and loop.
- Keep informational logging low-frequency. The log is a bounded ring buffer, so routine, high-churn
  events would push out the errors that matter.
- For tests, implement `ILogWriter`/`ILogStore` with an in-memory fake and inject a fixed clock into
  `Logger` for deterministic timestamps.
