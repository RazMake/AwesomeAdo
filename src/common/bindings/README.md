# src/common/bindings

This folder contains the query-binding layer for the AwesomeADO extension.

## Purpose

A **binding** records that a specific Azure DevOps query is handled by the extension and which
**view** handles it. The list of bindings is browser-synced, so it follows the signed-in user
across machines. This layer owns the binding data model, its synced store, and the contract used to
open the options page for one query. The **view type contract** lives in
[`src/common/view-common`](../view-common/README.md); the concrete catalog of views lives in
[`src/content/views`](../../content/views/README.md). A binding's `view` field is a `ViewType.id`
from that catalog.

## Public API

### `QueryBinding` / `QueryBindings` — `QueryBinding.ts`

```typescript
interface QueryBinding {
  view: string; // a ViewType id
  properties: Record<string, string>; // per-query values for that view's properties
  name?: string; // the query's display name captured when it was bound (best-effort)
}
type QueryBindings = Record<string, QueryBinding>; // keyed by ADO query id
```

The property values live on the binding, so the same view bound to two different queries can hold
different settings. `name` is the query's human-readable name captured at bind time so the options
UI can label a query even when its tab is closed. Whether a bound query shows its enhanced view or
ADO's standard page on load is governed by the global `defaultView` setting, **not** by the binding;
a user can flip one query for the current session via the top-bar menu, but that choice is a
device-local, memory-only override held in [`content/active-view`](../../content/active-view/README.md)
and is deliberately never persisted here. `resolveActiveView(override, defaultEnhanced)` collapses an
in-session override (or its absence) plus the global default to the concrete `"enhanced"` |
`"standard"` a consumer should render. `normalizeBindings(raw)` validates an unknown value from
storage into a safe map, dropping malformed entries while preserving bindings whose view id this
build does not recognize (forward-compatibility), keeping `name` only when valid, and dropping a
legacy `active` field written by an older build.

### `IQueryBindingStore` (interface) — `IQueryBindingStore.ts`

The abstraction features depend on:

```typescript
interface IQueryBindingStore {
  read(): Promise<QueryBindings>;
  bind(queryId: string, binding: QueryBinding): Promise<void>;
  unbind(queryId: string): Promise<void>;
  replaceAll(bindings: QueryBindings): Promise<void>;
  observe(listener: (bindings: QueryBindings) => void): {
    ready: Promise<void>;
    unsubscribe: () => void;
  };
}
```

- `read()` — current bindings, normalized.
- `bind(queryId, binding)` — create or replace one query's binding; others are untouched.
- `unbind(queryId)` — remove one query's binding; others are untouched, and it is a no-op when the
  query is not bound.
- `replaceAll(bindings)` — replace the entire map in one write (normalized first). Unlike `bind`
  and `unbind` it does not merge, so bindings the new set omits are dropped. Used by configuration
  import to adopt a saved set wholesale.
- `observe(listener)` — subscribe, then emit the initial snapshot. `ready` resolves after the first
  snapshot and rejects if the initial read fails. Call `unsubscribe()` to stop updates.

### `createQueryBindingStore()` — `createQueryBindingStore.ts`

The composition-root factory. Call this in `src/**/index.ts` entry files instead of constructing
the chrome-backed store yourself.

### Open-binding request — `BindingRequest.ts`

The contract for opening the options page. A content script cannot open an extension page directly,
so the top-bar menu sends a typed message to the background service worker, which opens the URL.

- `OPEN_BINDING_SETTINGS_MESSAGE`, `OpenBindingSettingsMessage`, `isOpenBindingSettingsMessage(value)`
  — the typed message (and its guard) that opens the options page pre-selected to bind one query.
  The message optionally carries the query's `queryName` scraped from the page it was triggered on.
- `OPEN_OPTIONS_MESSAGE`, `OpenOptionsMessage`, `isOpenOptionsMessage(value)` — the typed message
  (and its guard) that opens the general options page with no query pre-selected. It optionally
  carries a `section` to deep-link into (`"diagnostics"`) and `errorsOnly`, which additionally asks
  the Diagnostics log to open filtered to errors.
- `REVEAL_OPTIONS_SECTION_MESSAGE`, `RevealOptionsSectionMessage`,
  `isRevealOptionsSectionMessage(value)` — sent by the service worker to an options page that is
  already open, telling it to switch to `section` (honouring `errorsOnly`) in place, since a reused
  tab won't re-read the target from a URL.
- `REVEAL_BINDING_SETTINGS_MESSAGE`, `RevealBindingSettingsMessage`,
  `isRevealBindingSettingsMessage(value)` — sent by the service worker to an options page that is
  already open, telling it to jump to the Bindings tab and populate the form for one query in place
  (a reused tab won't re-read the query from a URL). Carries the same `queryId`/`queryName` payload.
- `bindingSettingsPath(queryId, queryName?)` — extension-relative options URL carrying the query id
  (and its name when known); pass it to `chrome.runtime.getURL`.
- `optionsPath(section?, errorsOnly?)` — extension-relative options URL with no query pre-selected;
  a `section` deep-links into that tab and `errorsOnly` opens the Diagnostics log filtered to errors.
- `sectionTabId(section)` — the options-page tab element id that presents a deep-linkable section.
- `readQueryIdFromSearch(search)` — read the query id back on the options page, or `null`.
- `readQueryNameFromSearch(search)` — read the query name back on the options page, or `null`.
- `readOptionsSectionFromSearch(search)` — read the section to reveal, or `null`.
- `readErrorsOnlyFromSearch(search)` — whether the URL asks for the log's errors-only filter.

## Storage layout

All bindings live under one synced key (`bindings.queries`) as a single map, because bindings are a
growing collection rather than independent scalar settings. `bind()` and `unbind()` read-modify-write
that map; last-writer-wins is acceptable since a user changes their own queries one at a time.
`replaceAll()` overwrites the whole key in a single write and is how configuration import replaces the
set without merging.
