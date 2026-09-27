# `common/view-common/control/ViewHeader`

The sticky header every tree board wears: an opaque card holding a top band (the query's folder
breadcrumbs and a right-hand corner with write status, version, and the ordering glyph) and a title
band (the board's name, the expand/collapse-all buttons, the filters, and Refresh). Project
Tracking, the All Projects Catalog, and the Consumers View compose their headers from these pieces,
so every header lines up and reads the same.

## Public API

`ViewHeader.ts`

- **`renderViewHeaderCard(doc, className)`** — the sticky, opaque card. Append the bands to it.
- **`renderViewHeaderTopBand(doc, options)`** — the `${classPrefix}__header-top` band. It always
  reserves the height of the tallest corner content, so the header never jumps when a save starts or
  fails. The `${classPrefix}__header-corner` holds, left to right: the optional write-queue status,
  the optional version marker, and the ordering picker (always last, so it never moves).
- **`renderViewTitleBand(doc, options)`** — the `${classPrefix}__header-title` band. Returns
  `{ element, refresh }`; drive `refresh` (the shared refresh button handle) from the board's load
  lifecycle.
- **`renderViewHeader(doc, options)`** — the whole header for a board with no bands of its own: the
  `${classPrefix}__header` card holding the top band and then the title band. Takes the union of
  both bands' options (`ViewHeaderOptions`) and returns `{ element, refresh }`. Boards that add
  bands of their own (Project Tracking) compose the three pieces above instead.

### `ViewHeaderTopBandOptions`

| Field              | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `classPrefix`      | The board's class namespace, for example `awesomeado-projects` |
| `breadcrumbs`      | The query's parent-folder segments, outermost first            |
| `writeQueueStatus` | Optional write-queue indicator element                         |
| `extensionVersion` | Optional built version for the quiet marker                    |
| `orderingPicker`   | The ordering indicator/picker element                          |

### `ViewTitleBandOptions`

| Field                              | Meaning                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `classPrefix`                      | The board's class namespace                                        |
| `title`                            | The heading text                                                   |
| `titleColor`                       | Optional semantic foreground for a work-item-backed heading        |
| `onTitleContextMenu(event)`        | Opens the board-wide menu from the heading                         |
| `expandLabel`, `collapseLabel`     | Tooltips for the `+` (`__expand-all`) and `−` (`__collapse-all`)   |
| `onExpandAll()`, `onCollapseAll()` | Outline button handlers                                            |
| `filters`                          | Narrowing controls placed, in order, in `__filters` before Refresh |
| `onRefresh()`                      | Handler for the `__refresh` button at the far right                |

Every control keeps its natural width, so a narrow header wraps whole controls rather than
squeezing their labels.

## Example

```typescript
const { element, refresh } = renderViewHeader(doc, {
  classPrefix: "awesomeado-consumers",
  breadcrumbs,
  writeQueueStatus,
  orderingPicker,
  title,
  filters: [areaFilter],
  ...
});
```
