# `content/shared-query`

Handles a **shared query**: an Azure DevOps saved query someone sent as a link that also names the
work item its AwesomeADO configuration must be read from
(`.../_queries/query/{id}?awesomeAdoConfig={workItemId}`).

Opening that link means one of two very different things, and this component is where the page acts
on the answer:

- **The recipient is on the item's team** — the work item simply becomes their configuration source,
  exactly as if they had connected to it on the options page. Nothing here stays scoped to one query.
- **The recipient is not on that team (or membership could not be determined)** — they get a
  read-only link for **that query alone**. Their own settings, their own bindings, and any team they
  do belong to are untouched; only this query renders from the publisher's configuration.

The decision itself lives in `common/settings-transfer/SharedQueryLinkService`; this folder applies
its result to the live page.

## Public API

### `SharedQueryController.ts`

- **`SharedQueryConfiguration`** — `{ queryId, workItemId, settings, binding }`: the publisher's
  configuration for the query currently on screen. `binding` is `null` when the publisher does not
  enhance that query.
- **`new SharedQueryController(linkService, sources, resolver, onConfiguration, logger)`**
- **`navigate(url)`** — applies any link the URL carries, then reports (through `onConfiguration`)
  the configuration the current query must render with, or `null` when it is not a shared query.
  Call it on load and on every SPA navigation: the answer is per query, not per tab.
- **`isReadOnly(queryId)`** — whether that query is currently rendered from a shared work item.
- **`release(queryId)`** — drop the link, so the query stops being enhanced from someone else's
  configuration. This is what the top-bar menu's "disable enhanced view" does for a shared query,
  which has no local binding to unbind.

A work item that cannot be read leaves the link in place and reports no configuration: an
unreachable item is usually temporary, and dropping the link would silently un-enhance the query for
good.

### `sharedQueryOverlay.ts`

Pure functions the composition root uses to fold the publisher's configuration into the page's.

- **`overlaySettings(local, shared)`** — the publisher's settings layered over the reader's own and
  re-normalized. Layered, not substituted, because a payload only carries the settings it described
  usably; anything it omits still needs an answer.
- **`overlayBindings(local, shared)`** — the reader's bindings with only the shared query's entry
  substituted (or removed, when the publisher does not enhance it). Every other query is untouched,
  so opening someone else's query never changes what the reader's own queries do.

Both return the input unchanged when `shared` is `null`, and neither mutates what it was given.
