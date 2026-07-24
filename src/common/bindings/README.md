# src/common/bindings

This folder contains the query-binding layer for the AwesomeADO extension.

## Purpose

A **binding** records that a specific Azure DevOps query is handled by the extension and which
**view** handles it. The list of bindings is browser-synced, so it follows the signed-in user
across machines. This layer owns the view catalog, the binding data model, its synced store, and
the contract used to open the options page for one query.

## Public API

### `ViewType` (interface) + `VIEW_TYPES` — `ViewType.ts`

The catalog of views a query can be bound to:

```typescript
interface ViewTypeProperty {
  key: string;
  label: string;
  required: boolean; // Save is gated until every required property has a value
  kind?: "text" | "number"; // how the binding form renders/validates it (default: text)
  defaultValue?: string; // seeded into a fresh input and substituted at save when empty
  min?: number; // inclusive bounds a `number` value is forced into (either end optional)
  max?: number;
  hint?: string; // one-line "why" shown under the input
}
interface ViewType {
  id: string; // stable, persisted on the binding
  label: string; // shown in the picker
  properties: readonly ViewTypeProperty[]; // required/optional inputs
}
```

`VIEW_TYPES` is the ordered source of truth (`Sprint View`, `Project Tracking`). **Add a new view
by appending an entry** — nothing else in the binding flow changes. `Project Tracking` declares the
per-query fields `orderingPolicy` (a `select` of how items are ordered — `importance`/`title`/`eta`,
default `importance`; the sort itself lives in `src/common/ordering`), `weeks` (1–52, default 2),
`days` (0–3650, default 4), and `hours` (default 24); their stated defaults apply whenever a binding
leaves one unset.

`getViewType(id)` returns a view by its stored id, or `undefined` when the id is unknown.
`viewTypePropertyKind(property)` reports its kind (treating an unset kind as `text`), and
`resolveViewTypePropertyValue(property, stored)` returns the value a binding should hold for a
property: it falls back to the declared default when nothing is stored, coerces a `number` to a
whole number clamped into `[min, max]`, and for a `select` keeps the stored value only while it is
still one of the offered options. The binding form routes both input-seeding and save through
`resolveViewTypePropertyValue`, so what it shows and what it stores never drift.

### `QueryBinding` / `QueryBindings` — `QueryBinding.ts`

```typescript
interface QueryBinding {
  view: string; // a ViewType id
  properties: Record<string, string>; // per-query values for that view's properties
  name?: string; // the query's display name captured when it was bound (best-effort)
  active?: "enhanced" | "standard"; // per-query override; absent = follow the global default view
}
type QueryBindings = Record<string, QueryBinding>; // keyed by ADO query id
```

The property values live on the binding, so the same view bound to two different queries can hold
different settings. `name` is the query's human-readable name captured at bind time so the options
UI can label a query even when its tab is closed. `active` is an optional per-query override,
separate from `view`: a bound query can be flipped to `"standard"` to show ADO's own page for that
one query, or to `"enhanced"` to force its view, regardless of the global default. When `active` is
absent the query follows the global default view. `resolveActiveView(active, defaultEnhanced)`
collapses that rule to the concrete `"enhanced"` | `"standard"` a consumer should render.
`normalizeBindings(raw)` validates an unknown value from storage into a safe map, dropping malformed
entries while preserving bindings whose view id this build does not recognize (forward-compatibility)
and omitting `active`/`name` unless they are valid.

### `IQueryBindingStore` (interface) — `IQueryBindingStore.ts`

The abstraction features depend on:

```typescript
interface IQueryBindingStore {
  read(): Promise<QueryBindings>;
  bind(queryId: string, binding: QueryBinding): Promise<void>;
  unbind(queryId: string): Promise<void>;
  setActiveView(queryId: string, active: "enhanced" | "standard"): Promise<void>;
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
- `setActiveView(queryId, active)` — flip a bound query between its enhanced view and ADO's standard
  view, preserving the binding's other fields; a no-op when the query is not bound. The store owns
  this so every mutation of the bindings map lives in one place.
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
  (and its guard) that opens the general options page with no query pre-selected.
- `REVEAL_BINDING_SETTINGS_MESSAGE`, `RevealBindingSettingsMessage`,
  `isRevealBindingSettingsMessage(value)` — sent by the service worker to an options page that is
  already open, telling it to jump to the Bindings tab and populate the form for one query in place
  (a reused tab won't re-read the query from a URL). Carries the same `queryId`/`queryName` payload.
- `bindingSettingsPath(queryId, queryName?)` — extension-relative options URL carrying the query id
  (and its name when known); pass it to `chrome.runtime.getURL`.
- `optionsPath()` — extension-relative options URL with no query pre-selected.
- `readQueryIdFromSearch(search)` — read the query id back on the options page, or `null`.
- `readQueryNameFromSearch(search)` — read the query name back on the options page, or `null`.

## Storage layout

All bindings live under one synced key (`bindings.queries`) as a single map, because bindings are a
growing collection rather than independent scalar settings. `bind()`, `unbind()`, and
`setActiveView()` read-modify-write that map; last-writer-wins is acceptable since a user changes
their own queries one at a time.
