# `content/views/project-tracking/drag-reorder`

The **tree-specific** half of drag-to-reorder: persisting a dropped move and applying Azure DevOps'
answer back to a board's in-memory tree. Project Tracking and the Consumers View both use it.

The generic drag controller, placement math, and drop indicator are shared with Sprint and live in
[`common/view-common/control/DragReorder`](../../../../common/view-common/control/DragReorder/README.md).

## Public API

### `persistTreeMove.ts`

- **`persistTreeMove({ root, move, team, queue, logger })`** — sends a `PlannedMove` through the
  board's shared write queue, then folds the answer back into the tree: the moved item's new rev,
  every rank ADO reported, its type when the move converted it, and its new parent. Resolves `true`
  when the tree changed and the caller should repaint. A move whose re-parent landed but whose
  ranking did not still re-homes the item, because that change is real in ADO. A dragged item that
  is no longer in the tree is logged and declined.

### `applyMoveToTree.ts`

- **`applyMoveToTree(root, move, order)`** — re-homes the moved item in the board's in-memory tree and
  sets its rank from ADO's returned `order`, so the next repaint shows the new position without
  re-reading the query. Returns false when the item or its destination is not in this tree.
- **`applyRanksToTree(root, ranks)`** — copies ranks ADO already holds onto the matching items.
  Placing one item can renumber its whole level, so a move reports every rank it wrote and all of them
  are copied back; refreshing only the moved one would leave its siblings sorting by stale numbers.
- **`findTreeItem(root, id)`** — the item with `id` at or below `root`, or `null`.

### `dragReorderAvailability.ts`

- **`dragReorderUnavailableReason(team, policy)`** — why the board cannot offer drag-to-reorder
  (no configured team, or an ordering other than the manual backlog rank), or `null` when it can.
  Hand it to the ordering picker's `dragReorderUnavailable` so the glyph explains a missing handle.

## Usage guidance

Apply a move only **after** Azure DevOps accepts it. The boards are persist-then-reflect throughout,
so a rejected move must leave the item visibly where it started.
