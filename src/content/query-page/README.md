# src/content/query-page

Decides whether the current ADO page should be enhanced and, when it should, paints the bound view's
enhanced surface in place of ADO's own query content.

## Purpose

On a Query route the extension hides ADO's own query content (while preserving the breadcrumb bar)
and mounts the bound view's surface in its place. This component owns that decision — derived from
the route, the synced bindings, and the settings — and the DOM mutation that carries it out. Heavy
work is gated behind a parsed query id so non-query pages pay no cost.

Lines it records use the log source **`content/query-page`**.

## Public API

### `EnhancedViewSurface.ts`

- **`EnhancedViewSurface`** — reversibly hides ADO's `[role="main"]` landmark and mounts the resolved
  view's DOM in a fixed overlay kept aligned to ADO's own content region — below the breadcrumb bar
  and to the right of the left navigation rail — so both of those survive, and follows that region as
  it moves (the left rail is collapsible, so its width changes at runtime), all without any view
  solving page coverage itself. Given an `EnhancedViewRequest` (`viewId`, `queryId`, `properties`) it
  resolves the view through the [enhanced-view registry](../views/README.md) and renders it; given
  `null` — or a `viewId` this build does not know — it restores ADO's own page. It re-attaches the
  style and host if ADO's post-load re-render drops them, disposes renderer-owned registrations when
  replacing a root, and only mutates the DOM; it makes no decision about _when_ or _which_ view to
  show. A deferred renderer leaves ADO visible while its bundle loads, and a request generation
  guard prevents a late import from replacing a newer navigation.

### `QueryPageController.ts`

- **`QueryPageController`** — decides which view (if any) takes over the current page and drives the
  `EnhancedViewSurface` accordingly. Reacts to `applySettings`, `applyBindings`, `navigate`, and
  `applyActiveViewOverride` (the composition root's nudge after this session's per-query switch
  changes), logging only when the conclusion changes (which view, or none — with the participating
  signals) so repeated refreshes do not flood the bounded log.

## Usage guidance

The controller is given an `EnhancedViewSurface`, the current URL, an `IActiveViewOverrides` (the
read side of this session's per-query switch, from [`content/active-view`](../active-view/README.md)),
and an `ILogger` at the composition root (see `src/content/index.ts`); it never touches `chrome.*` or
reads storage itself, so it is fully testable with a `jsdom` document and injected snapshots.
