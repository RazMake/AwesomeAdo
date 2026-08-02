# `content/views/project-tracking/drag-reorder`

Project Tracking's **tree-specific** half of drag-to-reorder: applying an accepted move back to the
board's in-memory tree.

The generic drag controller, placement math, and drop indicator are shared with Sprint and live in
[`common/view-common/control/DragReorder`](../../../../common/view-common/control/DragReorder/README.md).

## Public API

### `applyMoveToTree.ts`

- **`applyMoveToTree(root, move, order)`** — re-homes the moved item in the board's in-memory tree and
  sets its rank from ADO's returned `order`, so the next repaint shows the new position without
  re-reading the query. Returns false when the item or its destination is not in this tree.
- **`applyRanksToTree(root, ranks)`** — copies ranks ADO already holds onto the matching items.
  Placing one item can renumber its whole level, so a move reports every rank it wrote and all of them
  are copied back; refreshing only the moved one would leave its siblings sorting by stale numbers.

## Usage guidance

Call these only **after** Azure DevOps accepts the move. The board is persist-then-reflect
throughout, so a rejected move must leave the item visibly where it started.
