import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import {
  renderWriteQueueStatus,
  type WriteQueueStatusHandle,
} from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";

/** The write-queue indicator of a board that rebuilds its header on every paint. */
export interface BoardWriteStatus {
  /** A fresh indicator showing the queue's current state; the newest one keeps tracking it. */
  render(): HTMLElement;
}

/**
 * One lasting subscription to a board's write queue, feeding whichever indicator the latest paint
 * produced.
 *
 * The header — and the indicator inside it — is rebuilt on every paint, so the subscription cannot
 * hold one: without state kept outside the DOM a repaint mid-save would drop the "Saving…" chip and,
 * far worse, the report that an edit was rejected.
 */
export function createBoardWriteStatus(
  doc: Document,
  queue: Pick<WorkItemWriteQueue, "onPendingChange" | "onWriteFailed">,
  openDiagnosticsLog: () => void,
): BoardWriteStatus {
  const state: { pending: number; failed: number; lastError?: string } = { pending: 0, failed: 0 };
  let current: WriteQueueStatusHandle | null = null;
  queue.onPendingChange((count) => {
    state.pending = count;
    current?.setCount(count);
  });
  queue.onWriteFailed((count, lastError) => {
    state.failed = count;
    state.lastError = lastError;
    current?.setFailedCount(count, lastError);
  });
  return {
    render: () => {
      current = renderWriteQueueStatus(doc, { onOpenLog: openDiagnosticsLog });
      current.setCount(state.pending);
      current.setFailedCount(state.failed, state.lastError);
      return current.element;
    },
  };
}
