# src/options/diagnostics

The options page's **Diagnostics** tab: view, filter, export, and clear the device-local log.

## Purpose

Renders the shared local log (from `src/common/logging`) ordered by time, with a quick "errors only"
filter and a searchable per-source multi-select filter, plus export-to-text and clear actions.

This component **never logs**: it observes the same log store it renders, so a log during render
would feed the store it is observing and loop.

## Public API

### `DiagnosticsController.ts`

- **`DiagnosticsController`** — drives the log view: renders entries, applies the errors-only and
  per-source filters, exports the shown lines, and clears the log. Depends only on `ILogStore`
  (Dependency Inversion) so it never touches `chrome.*` and is fully testable with a fake store.
  `showErrorsOnly()` turns the errors-only filter on from outside — the deep link the board's
  "Couldn't save…" chip sends, so the log lands on the failure the user clicked. It is safe to call
  before `init()` resolves; entries arriving later render through the same filter.
- **`DiagnosticsElements`** — the log-view elements it drives, passed in so it stays DOM-agnostic.

### `MultiSelectFilter.ts`

- **`MultiSelectFilter`** — a reusable searchable multi-select dropdown with "Select all"/"Clear all"
  shortcuts and no logging knowledge. Used here for the per-source filter; co-located with its
  consumer. Sources become filter options, and entries without a source bucket under `(unlabeled)`.
- **`MultiSelectFilterOptions`** — the labels/placeholders and `onChange` hook it takes.

## Usage guidance

Construct `DiagnosticsController` at the options composition root with the shared `logStore` returned
by `createLogging()` and the elements (see `src/options/index.ts`).
