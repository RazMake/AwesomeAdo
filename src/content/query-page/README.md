# src/content/query-page

Decides whether the current ADO page should be enhanced and applies the reversible page blanking.

## Purpose

On a Query route the extension blanks ADO's own query content (while preserving the breadcrumb bar)
so an enhanced view can take its place. This component owns that decision — derived from the route,
the synced bindings, and the settings — and the DOM mutation that carries it out. Heavy work is gated
behind a parsed query id so non-query pages pay no cost.

Lines it records use the log source **`content/query-page`**.

## Public API

### `PageBlanker.ts`

- **`PageBlanker`** — applies reversible CSS to blank the query page content and restores it on
  demand. It only mutates the DOM; it makes no decisions about _when_ to blank.

### `QueryPageController.ts`

- **`QueryPageController`** — decides whether to enhance the current page and drives the
  `PageBlanker` accordingly. Reacts to `applySettings`, `applyBindings`, and `navigate`, logging only
  when the enhance/leave-on-ADO decision flips (with the participating signals) so repeated refreshes
  do not flood the bounded log.

## Usage guidance

The controller is given a `PageBlanker`, the current URL, and an `ILogger` at the composition root
(see `src/content/index.ts`); it never touches `chrome.*` or reads storage itself, so it is fully
testable with a `jsdom` document and injected snapshots.
