import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";

/** Persist an ETA and reflect it only after Azure DevOps returns the committed revision. */
export function writeItemEta(
  item: TrackedWorkItem,
  eta: string | null,
  field: string,
  queue: WorkItemWriteQueue,
  onCommitted: (eta: string | null) => void,
): void {
  void queue
    .enqueue({ id: item.id, currentRev: () => item.rev, field, value: eta })
    .then((result) => {
      if (!result.ok || result.rev === undefined) return;
      item.eta = eta;
      item.rev = result.rev;
      onCommitted(eta);
    });
}
