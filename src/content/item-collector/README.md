# src/content/item-collector

The floating work item collector shown while a collection runs.

## Public API

### `ItemCollectorWidget`

```typescript
const widget = new ItemCollectorWidget(document, itemCollection, resolveType, logger);
widget.applyTheme(settings.theme);
```

- Shows a counter at the bottom-right of the page while `itemCollection.isActive`, mounted on the
  page body so it stays through view repaints and query switches. Because the collection is synced
  (see `common/item-collection`), the counter also appears in other tabs and browsers.
- Left-clicking the counter opens a non-modal list: `× #id (type icon) title`, where `#id` opens the
  item in Azure DevOps and `×` removes it. It follows the collection live and closes from its button
  or Escape.
- Right-clicking offers **Copy all Ids to clipboard**, **Copy all ADO links to clipboard**, and
  **End collection**. Copying is disabled while nothing is collected.
- Dragging the counter moves it within the viewport. Its relative position is browser-synced, so it
  remains useful on different display sizes and follows the user across devices.
- While active, Ctrl+click (Cmd+click) on any work item adds it to the collection (never removes it)
  and pops the added item's type icon beside the pointer for each new addition (`showAddedBurst`).
- `applyTheme(theme)` pins the AwesomeADO palette, since the widget lives outside the view host.
- `dispose()` stops following the collection and removes everything.

### `renderCollectedItemsDialog(doc, options)`

Builds the collected-items list used by the widget; returns `{ element, refresh }`.

### `attachCtrlClickCollector(doc, ignoreWithin)`

Replays Ctrl+click as a collection probe on the clicked element (see `common/item-collection`) and
spends the click only when an item menu claimed it. Returns the detach function.
