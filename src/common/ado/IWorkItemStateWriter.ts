/**
 * The request to write a work item's state (System.State) back to Azure DevOps.
 *
 * Includes the item's last-known rev as an optimistic-concurrency guard: the patch operation will
 * fail when the rev no longer matches (the item was edited concurrently by someone else), which
 * avoids accidentally overwriting their change. The caller can retry the operation after refetching
 * the item to see the new rev, or let the patch fail and report it so a user re-checks the item's
 * current state before deciding to move it again.
 */
export interface WorkItemStateWriteRequest {
  /** The work item id whose state to change. */
  id: number;
  /** The item's last-known System.Rev, used as an optimistic-concurrency guard. */
  rev: number;
  /** The ADO state name to write (System.State). */
  state: string;
}

/**
 * The result of writing a work item's state: success or failure, plus the item's new rev on success
 * so the caller can update its cached copy without refetching the whole item.
 */
export interface WorkItemStateWriteResult {
  /** Whether the write succeeded; false means an error was logged. */
  ok: boolean;
  /** The item's new System.Rev after a successful write; undefined on failure. */
  rev?: number;
  /** A short error description when ok is false. */
  error?: string;
}

/**
 * Writes a work item's state (System.State) back to Azure DevOps.
 *
 * The contract is kept abstract so the view depends on this interface (Dependency Inversion): the
 * real implementation injects a credentialed fetch into the ADO tab's MAIN (page) world (the only
 * context that can access the APIs with the user's session cookies), and a test fake returns canned
 * results. The write uses JSON Patch with a rev test-and-set: the operation is atomic at the REST
 * level and fails when the item's rev has advanced since the caller last saw it (someone edited it
 * concurrently), so the caller either retries after refetching or reports the stale-rev conflict.
 */
export interface IWorkItemStateWriter {
  writeState(request: WorkItemStateWriteRequest): Promise<WorkItemStateWriteResult>;
}
