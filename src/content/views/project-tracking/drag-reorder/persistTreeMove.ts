import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../../common/logging/ILogger";
import type { PlannedMove } from "../../../../common/view-common/control/DragReorder/DragReorderController";

import { applyMoveToTree, applyRanksToTree, findTreeItem } from "./applyMoveToTree";

/** Everything one dropped move needs to reach Azure DevOps and come back onto the tree. */
export interface TreeMoveRequest {
  /** The in-memory tree holding the moved item, its old parent, and its new one. */
  root: TrackedWorkItem;
  move: PlannedMove;
  /** Backlog rank is per team in Azure DevOps, so a move always names the team it ranks for. */
  team: string;
  queue: WorkItemWriteQueue;
  logger: ILogger;
}

/**
 * Persist a dropped move and fold Azure DevOps' answer back into the tree.
 *
 * Persist-then-reflect: the tree is not touched until ADO confirms, so a rejected move leaves the
 * item visibly where it started. The move rides the board's shared queue because a re-parent
 * patches the item under a `/rev` test, and running it beside an in-flight field write on the same
 * item would race on exactly the value the test guards.
 *
 * Resolves true when the tree changed and the caller should repaint.
 */
export function persistTreeMove(request: TreeMoveRequest): Promise<boolean> {
  const { root, move } = request;
  const moved = findTreeItem(root, move.id);
  if (moved === null) {
    // The board is showing a tree that no longer contains the dragged item; writing a rev from a
    // stale model would be worse than declining the move.
    request.logger.error(`Drag-reorder aborted: item ${move.id} is not in the rendered tree.`);
    return Promise.resolve(false);
  }
  return request.queue
    .enqueueReorder({
      id: move.id,
      currentRev: () => moved.rev,
      parentId: move.parentId,
      currentParentId: move.currentParentId,
      previousId: move.previousId,
      nextId: move.nextId,
      siblingIds: move.siblingIds,
      type: move.type,
      team: request.team,
    })
    .then((result) => {
      if (result.rev !== undefined) moved.rev = result.rev;
      // Placing one item can renumber its whole level, so every reported rank is copied back or the
      // next re-sort would order the level by numbers ADO no longer holds.
      if (result.ranks !== undefined) applyRanksToTree(root, result.ranks);
      // A move whose re-parent landed but whose ranking did not is still a change ADO has applied:
      // leaving the item under its old parent on screen would show a tree that no longer exists and
      // send the same rejected request again on the next drag.
      if (!result.ok && result.reparented !== true) return false;
      if (move.type !== undefined) moved.type = move.type;
      return applyMoveToTree(root, move, result.order ?? null);
    });
}
