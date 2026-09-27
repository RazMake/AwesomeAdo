# `content/views/consumers`

The **Consumers View**: a tree query whose single top-level item only **groups** the consumers
beneath it. The grouping item is never drawn; each consumer is a row that opens onto the feature
requests it asked for. This folder holds both halves of the view — its configuration and its
renderer.

## Public API

- `consumersViewType.ts` → the view's config. `consumersViewType: ViewType` has id `"consumers"`,
  label `"Consumers View"`, and two per-query properties:
  - `orderingPolicy` (select) — how consumers and their requests are ordered; the choices and the
    default come from [`common/ordering`](../../../common/ordering).
  - `requestAreaPaths` (area-path list, optional) — the full area paths a feature request must sit in
    to be shown. Edited with the same list editor and autocomplete as Sprint View's area paths. Left
    empty, requests from every area path are shown.

  `orderingPolicyOf(properties)` and `consumerRequestAreaPaths(properties)` read those settings;
  use them instead of reading `properties[...]` directly.

- `ConsumersView.ts` → `consumersView: EnhancedView` — the renderer. It is a **deferred** renderer,
  emitted as its own web-accessible bundle (`content/consumers-view.js`) and resolved on first use.
- `ConsumersHeader.ts` → `renderConsumersHeader(context, options)` — the shared sticky
  [view header](../../../common/view-common/control/ViewHeader/README.md): folder breadcrumbs, the
  write-queue status, version, and ordering glyph on top; the root item's title in its ADO type
  color, expand/collapse-all, the Area filter, and Refresh below.
- `ConsumerRow.ts` → `renderConsumerRow(consumer, context)` and `visibleRequestsOf(consumer,
context)` — one consumer and, while open, its visible requests. Every row shows the shared
  type-colored `?` description control and uses its type icon to open Azure DevOps Discussion;
  request rows also show an editable Status badge.
- `consumersUrlPreferences.ts` → `readConsumersUrlAreaPaths(search)` and
  `consumersSearchWithAreaPaths(search, paths)` — the header filter's repeated `areaPath` URL
  parameters.

## Behaviour

- **Area paths.** A request is shown only when its area path belongs to one of the configured
  `requestAreaPaths` branches (if any) **and** exactly matches one of the header filter's picks (if
  any). Both comparisons ignore case. A configured parent includes descendant areas, while the live
  header still selects represented full paths as individual lanes. Consumers are **always** shown,
  even with no request in scope, so a request can still be dragged onto them. Anything below a
  request is not part of this board.
- **Header filter.** The Area filter offers only the areas of requests the configured paths keep. It
  narrows the list live, clears in one press of its lit trigger, and is mirrored to the page URL so a
  copied link reopens the same narrowed board. A linked area the board cannot offer is dropped from
  both the board and the URL.
- **Ordering and moves.** Under the importance ordering, and with a team configured, consumers can
  be dragged to reorder them, and requests can be dragged to reorder them within a consumer or
  handed to another consumer (dropping onto a consumer's middle appends to its requests, even when
  it is closed or empty). The backlog rank is the same field Project Tracking and the All Projects
  Catalog use. A consumer never nests under another and a request never becomes a consumer; a
  moved request keeps its type. Otherwise the ordering glyph says why dragging is unavailable.
- **Query shape.** A flat query, a query with no results, a query with more than one top-level item,
  and a grouping item with no consumers each show an explanatory message under the header, with
  Refresh still available.
- **Root heading.** The grouping item is represented by the header title rather than a tree row.
  Its title and work item type color come from Azure DevOps; the generic view name remains the
  fallback while data is unavailable or the query has no usable root.
- **Descriptions and Discussion.** The tree read includes every displayed item's rich description
  and comment count. `?` opens the safely rendered description and lifecycle details. The type icon
  opens the same fetch-on-first-use Discussion panel, note editor, mention search, and revision
  tracking as Project Tracking. Right-click **View all notes** opens the complete Discussion.
- There are no sprint, blocked, interrupt, or marker filters: those describe delivery work, not a
  consumer's request queue.
