import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { PRIORITY_FIELD } from "../../../common/ado/adoApi";

/** Persist a priority and reflect it only after Azure DevOps returns the committed revision. */
export function writeItemPriority(
  item: TrackedWorkItem,
  priority: number,
  queue: WorkItemWriteQueue,
  onCommitted: (priority: number) => void,
): void {
  void queue
    .enqueue({
      id: item.id,
      currentRev: () => item.rev,
      field: PRIORITY_FIELD,
      value: String(priority),
      baseValue: item.priority === null ? null : String(item.priority),
    })
    .then((result) => {
      if (!result.ok || result.rev === undefined) return;
      item.priority = priority;
      item.rev = result.rev;
      onCommitted(priority);
    });
}
