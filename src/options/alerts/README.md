# src/options/alerts

The options page's user-facing alert layer: transient error/status reporting and the two page-level
banners.

## Purpose

Surfaces problems to the user in three complementary ways: a status line that shows the latest
error, a banner that warns when queries are bound but the Azure DevOps settings are still
incomplete, and a banner that says Azure DevOps cannot be reached at all.

`StatusReporter` records the errors it shows to the shared local log under the source
**`options/alerts`**; the banner controllers do not log (they reflect state, not failures).

## Public API

### `StatusReporter.ts`

- **`StatusReporter`** — presents an error on the status line and records its full detail to the log.
  It is the sink the options composition root routes every caught error through, so a failure is both
  shown and diagnosable. Takes an `ILogger` at construction.

### `ConfigurationBannerController.ts`

- **`ConfigurationBannerController`** — shows a banner when at least one query is bound but the ADO
  settings are incomplete, reacting to the synced settings and bindings. Surfaces its own failures
  through the page's `report` sink.

### `AdoAccessBannerController.ts`

- **`AdoAccessBannerController`** — shows a banner when Azure DevOps cannot be reached, which in MV3
  means no ADO tab is open (the REST APIs are only reachable from a signed-in ADO tab's own page
  world). `init()` resolves reachability once, reflects it on the banner, and **returns** it so the
  composition root can turn off the controls that depend on it — the current-team picker, the work
  item type list, and the team configuration Connect / Pull / Publish actions. A failed probe counts
  as unreachable and is reported. Re-checking reloads the page, because every ADO-backed control is
  initialized from that same single read.
- **`AdoAccessBannerElements`** — the banner and its re-check button.

## Usage guidance

Construct all three at the options composition root: `StatusReporter` with the `options/alerts`
logger, `ConfigurationBannerController` with the shared settings and binding stores plus `report`,
and `AdoAccessBannerController` with the shared metadata probe (see `src/options/index.ts`).
