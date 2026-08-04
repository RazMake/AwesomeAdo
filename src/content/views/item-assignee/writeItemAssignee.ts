import type { DirectoryUser } from "../../../common/ado/IUserDirectory";
import type { TrackedUser, TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { ASSIGNED_TO_FIELD, identityFieldValue } from "../../../common/ado/adoApi";

/** Persist an assignment and reflect it only after Azure DevOps returns the committed revision. */
export function writeItemAssignee(
  item: TrackedWorkItem,
  picked: DirectoryUser,
  queue: WorkItemWriteQueue,
  onCommitted: (assigned: TrackedUser) => void,
): void {
  void queue
    .enqueue({
      id: item.id,
      currentRev: () => item.rev,
      field: ASSIGNED_TO_FIELD,
      value: identityFieldValue(picked),
    })
    .then((result) => {
      if (!result.ok || result.rev === undefined) return;
      // A freshly assigned person has no known crew tag until a roster reconcile answers, so the
      // chip shows the neutral pill in the meantime rather than the previous person's.
      const assigned: TrackedUser = {
        displayName: picked.displayName,
        uniqueName: picked.uniqueName,
        imageUrl: picked.imageUrl,
        tag: null,
      };
      item.assignedTo = assigned;
      item.rev = result.rev;
      onCommitted(assigned);
    });
}
