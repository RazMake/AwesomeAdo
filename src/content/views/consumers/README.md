# `content/views/consumers`

The **Consumers View**: a tree query whose single top-level item only **groups** the consumers
beneath it. The grouping item is never drawn; each consumer is a row that opens onto the feature
requests it asked for. This folder holds both halves of the view — its configuration and its
renderer.

## Public API

- `consumersViewType.ts` → the view's config. `consumersViewType: ViewType` has id `"consumers"`,
  label `"Consumers View"`, and two per-query properties:
  - `orderingPolicy` (select) — how consumers and their requests are ordered: **Drag-and-drop
    order** (the backlog rank, the default) or **By ETA (past/recent - future)**.
    `CONSUMERS_ORDERING_POLICIES` lists exactly those two; a saved value the board does not offer
    reads as the drag order.
  - `requestAreaPaths` (area-path list, optional, labelled "Request area paths") — the area
    branches a **feature request** must sit in to be shown. Edited with the same list editor and
    autocomplete as Sprint View's area paths. Left empty, every request is shown. Consumers are
    never filtered by area. A binding saved under the former `consumerAreaPaths` key is still read
    until the new key is saved.

  `orderingPolicyOf(properties)` and `requestAreaPaths(properties)` read those settings; use them
  instead of reading `properties[...]` directly.

- `ConsumersView.ts` → `consumersView: EnhancedView` — the renderer. It is a **deferred** renderer,
  emitted as its own web-accessible bundle (`content/consumers-view.js`) and resolved on first use.
- `ConsumersHeader.ts` → `renderConsumersHeader(context, options)` — the shared sticky
  [view header](../../../common/view-common/control/ViewHeader/README.md): folder breadcrumbs, the
  write-queue status, version, and ordering glyph on top; the root item's title in its ADO type
  color, the staged `+` / `−` buttons with the **Show consumers** switch and **Add Consumer** button
  beside them, the Consumer, Tags,
  and Area filters, and Refresh below. The ordering glyph offers only the board's two orderings.
- `ConsumerFilter.ts` → `renderConsumerFilter(doc, { consumers, selection, onChange })` — the
  header's Consumer dropdown, listing every consumer by title.
- `ConsumerRow.ts` → `renderConsumerRow(consumer, context)`, `renderRequestOnlyRow(request,
consumer, context)`, and `requestsOf(consumer, context)` — one consumer and, while open, its
  requests; one request of the requests list (with its consumer pill and **Needed by** date); and a consumer's
  area-filtered requests in the board's order.
  Every row shows the shared type-colored `?` description control and uses its type icon to open
  Azure DevOps Discussion; request rows also show an editable Status badge. Each consumer is ONE
  card-shaped row surface: its request count, then its title line with the service identity and
  contacts from [`profile/`](./profile/README.md) beneath it, sharing the `?`'s left edge. The
  description and Discussion panels open below the card, then — only while the consumer is opened
  from its count — its requests, never inside the card; right-clicking anywhere on the card (except
  inside a text field) opens the consumer's menu. That menu can add a tag already used by any loaded
  consumer (including filtered-out consumers), add a new custom tag, or clear one of the consumer's
  current tags. Suggestions exclude tags found only on the parent Epic or requests, ignore casing,
  and retain the existing spelling. Request menus do not offer consumer tagging.
- `profile/` → parses a consumer's description, draws its identity and Contacts list, and writes
  contact edits back into it. See its [README](./profile/README.md).
- `creation/` → the **Add new consumer** / **Add new request** menu commands, the header's
  **Add Consumer** button, and their forms. See
  its [README](./creation/README.md).
- `consumersUrlPreferences.ts` → `readConsumersUrlAreaPaths(search)` /
  `consumersSearchWithAreaPaths(search, paths)` and `readConsumersUrlConsumerIds(search)` /
  `consumersSearchWithConsumerIds(search, ids)` — the header filters' repeated `areaPath` and
  `consumer` URL parameters. The Tags filter uses the shared `tags` / `notTags` / `tagMatch`
  contract from [`../tag-selection`](../tag-selection/README.md).
- `treeExpansion.ts` → `collapseStep(state, shownIds, levels)` and `expandStep(state, levels)` —
  what one press of the header's `−` or `+` closes or opens (`ExpansionState`, whose `expandedIds`
  are the rows the reader opened, and `ExpandableLevels`), returning an `ExpansionStep` for the
  diagnostics log, or null when there was nothing left to do.

## Behaviour

- **Request counts.** Every consumer starts closed. The first column of its card shows how many
  feature requests it made; pressing that count opens the requests below the card (the count fills
  while open) and pressing it again closes them. A consumer with none shows an inert `0`.
- **Requests list (default).** The board opens on one list of every shown consumer's feature
  requests, ordered across consumers by the board's ordering. Each is tagged with its consumer's
  name (dropped while the Consumer filter has picks) and shows its Status, `?` description,
  Discussion, right-click menu, and a **Needed by** date read from and edited in the request type's
  configured ETA field (no date when the type has none).
- **Show consumers.** The switch beside `+` / `−` replaces the list with the consumer cards. It is
  remembered **per query** in the reader's
  browser-synced settings (`consumersShowConsumersQueryIds`, personal and never team-shared), so the
  query reopens in the mode it was left in on every signed-in browser; a Refresh never re-applies
  the saved mode over a flip made since.
- **Area paths.** Area paths narrow **feature requests only**; consumers are never filtered by area.
  A request is shown only when its area path belongs to one of the configured `requestAreaPaths`
  branches (if any) **and** exactly matches one of the header Area filter's picks (if any). Both
  comparisons ignore case. A configured parent includes descendant areas, while the live header
  selects represented full request paths as individual lanes. In consumer cards, each request count
  shows only the requests the area filters keep. When the area filters leave no request, the
  requests list says so under the header. Anything below a request is not part of this board.
- **Header filters.** Consumer and Tags narrow the **consumers** live, in both modes; Area narrows
  their **requests**. Consumer offers every consumer; Area offers the request paths the binding
  keeps; Tags offers the consumers' own tags (requests' tags are ignored) and
  works like the All Projects Catalog's (any/all, with exclusions). Each clears in one press of its
  lit trigger and is mirrored to the page URL so a copied link reopens the same narrowed board; a
  linked value the board cannot offer is dropped from both the board and the URL.
- **`−` and `+`.** Each press of `−` closes one layer: every open description first, then every open
  Discussion, and only then the deepest tree level still open. `+` only ever opens the tree, one
  level per press, shallowest first; it never opens a description or Discussion. In the
  requests list there is no tree, so `−` closes only panels and `+` has nothing to open.
- **Ordering and moves.** Under **Drag-and-drop order**, with a team configured, requests in the
  requests list can be dragged to rank them among all listed requests; each stays under its own
  consumer, and its backlog rank is the same field Project Tracking and the All Projects Catalog
  use. **By ETA** sorts by the needed-by date and turns dragging off. The consumer cards follow the
  chosen ordering but never offer a drag. The ordering glyph says why dragging is unavailable.
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
- **Consumer cards.** A consumer's own description is read for the service it is
  (`**ServiceName** (client id)`) and the people behind it, drawn on the consumer's card without
  opening anything. Contacts are listed one per line as assignee pills with their role as a tag
  (`??` until given one); the alias is in the tooltip. The `+` beside **Contacts** adds a person
  found in Azure DevOps (with no role yet), a name opens the picker to put someone else in that
  place, the red `×` at the start of a pill removes that person, and the role pill picks or adds a
  role — each written into the description's Contacts section in one guarded write. The description
  is read loosely, since people edit it by hand (see [`profile/`](./profile/README.md)). A rich-text
  description's contacts are shown read-only, with a tooltip saying the description has to be
  Markdown to be editable; so is a contact that shares its line, sits in a table, or is written
  outside the Contacts section. The card is a single outlined row, so its stripe and hover cover the
  whole record. The consumer's own Azure DevOps tags follow its name as pills; requests never show
  theirs.
- **Adding consumers and requests.** Right-clicking the header title offers **Add new consumer**;
  right-clicking a consumer card offers **Add new request**. The header's
  **Add Consumer** button, beside **Show consumers**, opens the same consumer form beneath itself;
  it is disabled, saying why, until the consumer cards are shown. Each form is
  centered (see [`creation/`](./creation/README.md)) and, once Azure DevOps has created the
  item, re-read the query so it appears wherever the query places it. A command is disabled, saying
  why, when the board cannot tell which work item type to create.
- There are no sprint, blocked, interrupt, or marker filters: those describe delivery work, not a
  consumer's request queue.
