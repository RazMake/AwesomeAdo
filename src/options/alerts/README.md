# src/options/alerts

The options page's user-facing alert layer: transient error/status reporting and the
configuration-incomplete banner.

## Purpose

Surfaces problems to the user in two complementary ways: a status line that shows the latest error,
and a page-level banner that warns when queries are bound but the Azure DevOps settings are still
incomplete.

`StatusReporter` records the errors it shows to the shared local log under the source
**`options/alerts`**; `ConfigurationBannerController` does not log (it reflects state, not failures).

## Public API

### `StatusReporter.ts`

- **`StatusReporter`** — presents an error on the status line and records its full detail to the log.
  It is the sink the options composition root routes every caught error through, so a failure is both
  shown and diagnosable. Takes an `ILogger` at construction.

### `ConfigurationBannerController.ts`

- **`ConfigurationBannerController`** — shows a banner when at least one query is bound but the ADO
  settings are incomplete, reacting to the synced settings and bindings. Surfaces its own failures
  through the page's `report` sink.

## Usage guidance

Construct both at the options composition root: `StatusReporter` with the `options/alerts` logger,
and `ConfigurationBannerController` with the shared settings and binding stores plus `report`
(see `src/options/index.ts`).
