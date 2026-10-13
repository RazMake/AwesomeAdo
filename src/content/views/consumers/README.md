# `content/views/consumers`

The **Consumers View**: a tree query whose single top-level item only **groups** the consumers
beneath it. The grouping item is never drawn; each consumer is a row that opens onto the feature
requests it asked for. This folder holds both halves of the view — its configuration and its
renderer.

## Public API

- `consumersViewType.ts` → the view's config. `consumersViewType: ViewType` has id `"consumers"`,
  label `"Consumers View"`, and these per-query properties:
  - `orderingPolicy` (select) — how consumers and their requests are ordered: **Drag-and-drop
    order** (the backlog rank, the default) or **By ETA (past/recent - future)**.
    `CONSUMERS_ORDERING_POLICIES` lists exactly those two; a saved value the board does not offer
    reads as the drag order.
  - `requestAreaPaths` (area-path list, optional, labelled "Request area paths") — the area
    branches a **feature request** must sit in to be shown. Edited with the same list editor and
    autocomplete as Sprint View's area paths. Left empty, every request is shown. Consumers are
    never filtered by area. A binding saved under the former `consumerAreaPaths` key is still read
    until the new key is saved.
  - `requestStateMapping` (state-mapping table, optional, labelled "Request states") — maps ADO
    states to the five request states this view shows (**New (Untriaged)**, **Needs
    Clarification**, **Accepted**, **Rejected**, **Done**). It is edited with the same table as the
    options page's Azure DevOps tab, with one fixed **User Story** row (types are not configurable),
    one column per request state, and each cell holding User Story's ADO states as chips. A mapping
    saved earlier on the former **Task** row carries over into it. The first chip in a
    cell is the state written when the reader picks that request state (later chips are fallbacks
    when the first cannot be reached). A request of another type uses that same row unless the
    table has a row named after its own type. An
    empty cell writes the ADO state named exactly like the request state. Every request state is
    always offered. The binding property is included in shared configuration.
  - `questionStateMapping` (state-mapping table, optional, labelled "Question states") — the same
    table with one fixed **Task** row, mapping question Tasks onto **Open** (gray), **In Progress**
    (blue), **Answered** (green), and **Removed** (red).

  `orderingPolicyOf(properties)`, `requestAreaPaths(properties)`, and
  `requestStateMapping(properties)` read those settings; use them instead of reading
  `properties[...]` directly. `requestStatesFor(item, mapping)` and `mappedRequestState(item,
mapping)` resolve one request through its own type's row.

- `ConsumersView.ts` → `consumersView: EnhancedView` — the renderer. It is a **deferred** renderer,
  emitted as its own web-accessible bundle (`content/consumers-view.js`) and resolved on first use.
- `ConsumersHeader.ts` → `renderConsumersHeader(context, options)` — the shared sticky
  [view header](../../../common/view-common/control/ViewHeader/README.md): folder breadcrumbs, the
  write-queue status, version, and ordering glyph on top; the root item's title in its ADO type
  color, the staged `+` / `−` buttons with the **View consumers** / **View requests** button and
  **Add Consumer** button beside them, then the By name, By state (a consumer condition in
  consumers mode; a request-state condition in requests mode), Tags, and
  Area filters plus Refresh
  below. The ordering glyph offers only the board's two orderings.
- `ConsumerConditionFilter.ts` → `renderConsumerConditionFilter(doc, options)` — the **By state**
  pick-one filter for consumers with open questions, untriaged requests, or committed requests.
- `RequestStateFilter.ts` → `renderRequestStateFilter(doc, { condition, onChange })` — the requests
  list's **By state** multi-select over the five fixed request states, each with a **NOT** button.
  Ticked states are alternatives (a request has one state); excluded states are removed;
  `requestStates.ts` holds `matchesRequestStateCondition`. The condition is session-only, applies
  to the requests list alone, and an unmapped raw state fails a ticked condition but survives a NOT.
- `requestStates.ts` → resolves the binding's ADO state mappings into the fixed request state
  model: **New** (gray), **Needs Clarification** (yellow), **Accepted** (blue), **Rejected**
  (red), and **Done** (green).
- `RequestStatusBadge.ts` → the editable semantic request status control. It displays the fixed
  request-state label and color, always offers every request state, and changes the item through
  the shared [`changeItemState`](../item-status/README.md) router: when Azure DevOps does not allow
  the change directly, the intermediary states are written first, each through the board's
  serialized queue.
- `ConsumerFilter.ts` → `renderConsumerFilter(doc, { consumers, selection, onChange })` — the
  header's **By name** dropdown, listing every consumer by title.
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
- `creation/` → the **Add new consumer** / **Add new request** / **Add new question** menu
  commands, the header's **Add Consumer** button, and their forms. See
  its [README](./creation/README.md).
- `pendingQuestions.ts` → the `PendingQuestions` tag, the standard Pending Questions title and
  description, `consumerRequests(consumer)` (which excludes every tagged User Story child),
  `openConsumerQuestions(consumer)` (active Task children aggregated across those stories),
  `latestPendingQuestionsStory(consumer)` (the highest-id story, where new questions go), and
  `hasActivePendingQuestions(consumer)`.
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
  while open) and pressing it again closes them. A consumer with none shows no request-count badge.
- **Requests list (default).** The board opens on one list of every shown consumer's feature
  requests, ordered across consumers by the board's ordering. Each is tagged with its consumer's
  name (dropped while the Consumer filter has picks) and shows its Status, `?` description,
  Discussion, right-click menu, and a **Needed by** date read from and edited in the request type's
  configured ETA field (no date when the type has none).
- **View consumers / View requests.** The button beside `+` / `−` switches between the requests
  list and the consumer cards; its label names the mode a press leads to, it has no tooltip, and it
  is always filled blue (darker while showing the consumers). The mode is
  remembered **per query** in the reader's
  browser-synced settings (`consumersShowConsumersQueryIds`, personal and never team-shared), so the
  query reopens in the mode it was left in on every signed-in browser; a Refresh never re-applies
  the saved mode over a flip made since.
- **By state.** Shown only in consumers mode, and never narrows the requests list. A pick-one menu
  (no checkboxes, heading, or Clear): picking closes it, the trigger's tooltip names the condition
  ("Consumers waiting for answers", …), and pressing the lit trigger clears it.
  **Waiting for answers** keeps consumers with at least one open aggregated question;
  **With untriaged requests** keeps consumers with at least one currently visible request mapped to
  New; **With committed requests** does the same for requests mapped to Accepted. A qualifying
  consumer retains all of its currently visible
  requests rather than narrowing the request list to only the matching request.
- **Request states.** Request rows translate raw ADO states through the binding's Task state table
  and display the fixed **New**, **Needs Clarification**, **Accepted**, **Rejected**, and **Done**
  labels and colors. Every request state is always offered, so a request can move from any state to
  any other. Selecting one targets the first raw state in that cell (an empty cell targets the state
  named like the request state). When the work item type's process forbids that change from the
  current state, the request is moved transparently along the shortest allowed path — each
  intermediary state is written and confirmed before the next — and the badge repaints only once
  the selected state is reached. If a later step fails, the request is shown in the intermediary
  state it stopped in and the failure is logged. If the type's transitions cannot be read, the
  target is written directly. An unmapped raw state remains visible with neutral styling so
  configuration mistakes do not hide status information.
- **Question states.** Open question rows show the same editable status badge, using the binding's
  question table. Mapped **Answered** and **Removed** questions are no longer open; an unmapped
  state counts as closed only when it is Closed, Resolved, or Removed.
- **Pending Questions storage.** Every direct User Story child carrying the `PendingQuestions` tag
  is question storage, not a feature request. All such stories and their Task children are omitted
  from both view modes, request counts, ordering, and request-creation defaults; Test Case / Shared
  Steps links and story titles are ignored. Active Tasks from every tagged story are aggregated, and
  a consumer card shows the total in a yellow **Open questions: N** badge only while at least one
  question remains open.
- **Area paths.** Area paths narrow **feature requests only**; consumers are never filtered by area.
  A request is shown only when its area path belongs to one of the configured `requestAreaPaths`
  branches (if any) **and** exactly matches one of the header Area filter's picks (if any). Both
  comparisons ignore case. A configured parent includes descendant areas, while the live header
  selects represented full request paths as individual lanes. In consumer cards, each request count
  shows only the requests the area filters keep. When the area filters leave no request, the
  requests list says so under the header. Anything below a request is not part of this board.
- **Header filters.** Consumer, Tags, and consumer condition narrow the **consumers** live, in both
  modes; Area narrows their **requests**. Consumer offers every consumer; Area offers the request
  paths the binding keeps; Tags offers the consumers' own tags (requests' tags are ignored) and
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
  opening anything. Contacts share a row as assignee pills and wrap when space runs out, with their
  role as a tag (`??` until given one); the alias is in the tooltip. The `+` beside **Contacts** adds a person
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
  right-clicking a consumer card offers **Add new request** and, right below it, **Add new
  question** (disabled, saying why, when the consumer has no Pending Questions story). The header's
  **Add Consumer** button, beside **Show consumers**, opens the same consumer form beneath itself;
  it is disabled, saying why, until the consumer cards are shown. Each form is
  centered (see [`creation/`](./creation/README.md)) and, once Azure DevOps has created the
  item, re-read the query so it appears wherever the query places it. A command is disabled, saying
  why, when the board cannot tell which work item type to create. A new consumer also gets its
  linked Pending Questions story automatically.
- There are no sprint, blocked, interrupt, or marker filters: those describe delivery work, not a
  consumer's request queue.
