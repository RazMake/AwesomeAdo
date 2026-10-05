# src/common/item-collection

A reader-driven collection of work items gathered across every enhanced view, query, tab and synced
browser, plus the text formats it is copied out in.

## Public API

### `ItemCollection.ts`

- **`CollectedItem`** — `{ id, title, type, url }`; `type` is the work item type name, `url` the
  deep link or `null`.
- **`IItemCollection`** — the contract consumers depend on:
  - `isActive`, `items()`, `has(id)`
  - `start()` / `end()` — `end()` also drops every item.
  - `toggle(item)` — adds or removes; ignored while inactive.
  - `remove(id)`
  - `subscribe(listener)` — returns the unsubscribe function.
- **`ItemCollection`** — the in-memory implementation; construct it once at the content composition
  root with a `common/item-collection` logger.
- **`ItemCollectionState`** / **`IRestorableItemCollection`** — `{ items }` or `null` (not running),
  and the contract's `restore(state)`, which replaces the whole collection (notifying only on change).

### `ItemCollectionSync.ts`

- **`new ItemCollectionSync(collection, syncStorage, logger).connect()`** — keeps the collection and
  the reader's synced copy in step, so a collection started in one view, tab or browser continues in
  every other one; returns the disconnect function. Construct it at the content composition root.

### `storedItemCollection.ts`

- **`encodeItemCollection(state)`** / **`decodeItemCollection(raw)`** — the compact synced form under
  `ITEM_COLLECTION_STORAGE_KEY`. Titles are shortened to fit the per-key sync size limit;
  unrecognised data reads as no collection.
- **`fitsSyncBudget(value)`** — whether an encoded collection can be synced (a few hundred items).

### `formatCollection.ts`

- **`formatCollectedIds(items)`** — `"7, 9"`.
- **`formatCollectedLinksText(items)`** — one `#id Type Title - url` line per item.
- **`formatCollectedLinksHtml(items)`** — the same lines as escaped HTML with each `#id` linked.

### `collectProbe.ts`

Ctrl+click collection is replayed as a marked synthetic `contextmenu` event, so it reuses each view's
existing "which item is under the pointer" wiring.

- **`markCollectProbe(event)`** / **`isCollectProbe(event)`** — mark and recognize a probe.
- **`markCollectProbeHandled(event)`** / **`wasCollectProbeHandled(event)`** — an item menu records
  that it resolved the probe to a work item, so the originating click is spent.

## Usage

Pass the shared instance to `createItemContextMenu({ collection })` (through
`EnhancedViewServices.itemCollection`) and to the content-level collector widget. Nothing here
touches the DOM.
