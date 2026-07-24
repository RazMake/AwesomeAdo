# src/content/ado-probe

Read-only probes that scrape facts out of the live Azure DevOps page DOM for the content script.

## Purpose

The content script sometimes needs a detail that only the ADO page itself knows — the human-readable
query name, or the light/dark theme ADO is currently painting. These are pure, side-effect-free
readers: they inspect a `Document` and return a value (or `null` when the page has not rendered the
detail yet). They never mutate the page and never log.

## Public API

### `AdoQueryNameProbe.ts`

- **`detectAdoQueryName(doc)`** — returns the query's display name scraped from the page, or `null`
  when it cannot be found. Used when starting a bind so the options page can show the query name
  without re-scraping ADO from its own tab.

### `AdoThemeProbe.ts`

- **`detectAdoTheme(doc)`** — returns the `AdoTheme` ADO is rendering (`"light"`/`"dark"`), or `null`
  when it cannot be determined. Used to resolve the extension's `"auto"` theme against ADO's own.
- **`parseLuminance(color)`** — helper that turns a CSS color string into a 0–1 luminance, or `null`
  when the value is unparseable. Exported for focused testing of the light/dark decision.

## Usage guidance

Both probes take the `Document` explicitly (rather than reaching for the global `document`) so they
stay pure and testable with a `jsdom` fixture. Call them only while the content script is on the ADO
page that owns the detail.
