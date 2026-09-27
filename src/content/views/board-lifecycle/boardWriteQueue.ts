import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

/**
 * The one serialized write queue a tree board sends every field edit and every drag move through.
 *
 * One queue per board, shared by both kinds of write, because a move and an edit to the same item
 * each carry the item's `System.Rev`; running them side by side would let one invalidate the rev
 * the other is about to send. The services are reached through closures rather than handed over as
 * detached methods, so a services object whose methods rely on `this` keeps working.
 */
export function createBoardWriteQueue(
  services: Pick<EnhancedViewServices, "writeField" | "reorderItem" | "logger">,
): WorkItemWriteQueue {
  return new WorkItemWriteQueue(
    (request) => services.writeField(request),
    services.logger,
    (request) => services.reorderItem(request),
  );
}
