# `content/views/project-tracking/drag-reorder`

Drag-to-reorder for the Project Tracking tree: grabbing a row's title and dropping it somewhere else
in the board changes the item's manual backlog rank and, when it lands under a different parent, its
place in the hierarchy.

## Public API

### `DragReorderController.ts`

- **`new DragReorderController(doc, onMove, logger)`** — turns rows into a drag surface.
  - **`register(row: DraggableRow)`** — makes one row draggable by its `handle` and a drop target for
    rows at its own level. A row that is never registered is never draggable, so the caller alone
    decides when reordering is offered.
  - **`reset()`** — abandons any drag still in flight. Call it before a repaint; the previous pass's
    registrations need no undoing because their elements are discarded with it.
- **`DraggableRow`** — what one row tells the controller: its `id`, `depth`, `parentId`, the level's
  **full unfiltered** `siblingIds` in board order, and three elements — the `handle` (the title), the
  `row` line box (whose midpoint decides above/below), and the `wrapper` the insertion line slots
  against.
- **`PlannedMove`** — a resolved drop: `{ id, currentParentId, parentId, previousId, nextId }`, handed
  to `onMove` for the caller to persist.

### `movePlacement.ts`

- **`MovePlacement`** — a landing spot as ADO takes it: `parentId` plus the `previousId`/`nextId` it
  sits between (`0` is ADO's sentinel for "no parent" / "start" / "end").
- **`placementOf(id, siblingIds, parentId)`** — the placement an item already occupies, or null when
  it is not in the list.
- **`resolveMove({...})`** — where a drop lands, or **null** when the drop is impossible or is a
  no-op (dropped back onto its own slot). Pure, so the rules are testable without a DOM.

### `applyMoveToTree.ts`

- **`applyMoveToTree(root, move, order)`** — re-homes the moved item in the board's in-memory tree and
  sets its rank from ADO's returned `order`, so the next repaint shows the new position without
  re-reading the query. Returns false when the item or its destination is not in this tree.

### `DropIndicator.ts`

- **`new DropIndicator(doc)`** with **`show(wrapper, side, { reparenting, parentContainer })`** and
  **`clear()`** — the insertion line, plus the wash that names the destination when the drop also
  changes parent.

## Usage guidance

Register every rendered row on each pass, calling `reset()` first. Pass the level's **full** sibling
list, not the filtered one — ranking against only the visible rows would place the item relative to
whatever the sprint/tag filters happened to leave on screen, so clearing the filter afterwards would
reveal it somewhere the user never dropped it.

The controller decides and previews; it never writes. Persist the `PlannedMove` yourself, then call
`applyMoveToTree` and repaint **after** Azure DevOps accepts it — the board is persist-then-reflect
throughout, so a rejected move must leave the item visibly where it started.

Two rules are enforced for you, so the preview and the drop can never disagree: a row may only land
at its **own depth** (an item never becomes a child of a row it was a peer of, and an item with
children is only ever reordered among its own siblings), and a drop that reproduces the item's
current placement is reported as no move at all.
