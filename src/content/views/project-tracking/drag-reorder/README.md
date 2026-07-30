# `content/views/project-tracking/drag-reorder`

Drag-to-reorder for the Project Tracking tree: grabbing a row's title and dropping it somewhere else
in the board changes the item's manual backlog rank and, when it lands under a different parent, its
place in the hierarchy.

## Public API

### `DragReorderController.ts`

- **`new DragReorderController(doc, onMove, logger)`** — turns rows into a drag surface.
  - **`register(row: DraggableRow)`** — makes one row draggable by its `handle` and a drop target for
    rows at its own or an adjacent level. A row that is never registered is never draggable, so the caller alone
    decides when reordering is offered.
  - **`reset()`** — abandons any drag still in flight. Call it before a repaint; the previous pass's
    registrations need no undoing because their elements are discarded with it.
- **`DraggableRow`** — what one row tells the controller: its `id`, `depth`, `hasChildren`,
  `parentId`, the parent's default `destinationType`, the level's **full unfiltered** `siblingIds` in board order, and three elements — the `handle` (the title), the
  `row` line box (whose midpoint decides above/below), and the `wrapper` the insertion line slots
  against. Popup rows also provide their `dragSurface` and `onLeaveSurface`, so reaching a legal
  target outside the popup dismisses it without ending the drag.
- **`PlannedMove`** — a resolved drop: `{ id, currentParentId, parentId, previousId, nextId,
siblingIds, type? }`, handed to `onMove` for the caller to persist.

### `movePlacement.ts`

- **`MovePlacement`** — a landing spot as ADO takes it: `parentId` plus the `previousId`/`nextId` it
  sits between (`0` is ADO's sentinel for "no parent" / "start" / "end").
- **`ResolvedMove`** — a `MovePlacement` plus `siblingIds`, the destination level in its **post-drop**
  order. Azure DevOps refuses to rank items that hold no backlog position, and the rank written by
  hand in that case is derived from the level the user actually ended up with.
- **`placementOf(id, siblingIds, parentId)`** — the placement an item already occupies, or null when
  it is not in the list.
- **`resolveMove({...})`** — where a drop lands, or **null** when the drop is impossible or is a
  no-op (dropped back onto its own slot). Pure, so the rules are testable without a DOM.

### `applyMoveToTree.ts`

- **`applyMoveToTree(root, move, order)`** — re-homes the moved item in the board's in-memory tree and
  sets its rank from ADO's returned `order`, so the next repaint shows the new position without
  re-reading the query. Returns false when the item or its destination is not in this tree.
- **`applyRanksToTree(root, ranks)`** — copies ranks ADO already holds onto the matching items.
  Placing one item can renumber its whole level, so a move reports every rank it wrote and all of them
  are copied back; refreshing only the moved one would leave its siblings sorting by stale numbers.

### `DropIndicator.ts`

- **`new DropIndicator(doc)`** with **`show(wrapper, side, { reparenting, parentContainer })`** and
  **`clear()`** — the insertion line, plus the wash that names the destination when the drop also
  changes parent. Same-parent ordering uses the theme accent; reparenting uses the theme success
  color, so the marker communicates which operation will happen without fixed light-only colors.

## Usage guidance

Register every rendered row on each pass, calling `reset()` first. Pass the level's **full** sibling
list, not the filtered one — ranking against only the visible rows would place the item relative to
whatever the sprint/tag filters happened to leave on screen, so clearing the filter afterwards would
reveal it somewhere the user never dropped it.

The controller decides and previews; it never writes. Persist the `PlannedMove` yourself, then call
`applyMoveToTree` and repaint **after** Azure DevOps accepts it — the board is persist-then-reflect
throughout, so a rejected move must leave the item visibly where it started.

Hierarchy changes move one level at a time. Dropping a child between rows one level above promotes it
under their parent; dropping a leaf among rows one level below demotes it under their parent at the
exact targeted position. A source that still owns children cannot be demoted. Any changed parent also
requires the destination parent's configured default child type; without one, the drop is refused.
A drop that reproduces the item's current placement is reported as no move at all.
