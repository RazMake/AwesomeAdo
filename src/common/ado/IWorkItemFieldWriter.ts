/**
 * How Azure DevOps stores the text of a MULTILINE field (`System.Description` and friends).
 *
 * ADO keeps this per field, alongside the value, and defaults it to `Html`. A field left on `Html`
 * stores whatever it is handed VERBATIM, so writing Markdown into one persists the asterisks and
 * hashes as literal characters rather than as formatting. Declaring the format is therefore part of
 * writing the value, not a separate setting — which is why it rides along on the write request.
 */
export type MultilineFieldFormat = "Markdown" | "Html";

/**
 * The request to write a single work item field back to Azure DevOps.
 *
 * Includes the item's last-known rev as an optimistic-concurrency guard: the patch operation will
 * fail when the rev no longer matches (the item was edited concurrently by someone else), which
 * avoids accidentally overwriting their change. The caller can retry the operation after refetching
 * the item to see the new rev, or let the patch fail and report it so a user re-checks the item's
 * current value before deciding to change it again.
 */
export interface WorkItemFieldWriteRequest {
  /** The work item id whose field to change. */
  id: number;
  /** The item's last-known System.Rev, used as an optimistic-concurrency guard. */
  rev: number;
  /** The ADO field reference name to write (e.g. `System.State` or a type's ETA date field). */
  field: string;
  /** The value to set; `null` clears the field (removes its current value). */
  value: string | null;
  /**
   * The storage format to put a MULTILINE field into as part of this write. Omitted leaves the
   * field's current format alone, which is what every single-line field wants.
   */
  multilineFormat?: MultilineFieldFormat;
  /**
   * A discussion comment to record **as part of this same revision** (written to `System.History`).
   *
   * Here rather than posted separately because posting a comment through the comments API ADVANCES
   * the item's rev, which then invalidates the `test /rev` guard on any field write that follows it
   * — an edit that says why it happened would otherwise be rejected with HTTP 412 every time. Riding
   * along in the patch also makes the two atomic: the reason and the change land together or neither
   * does, so the item can never carry one without the other.
   *
   * Plain text. `System.History` is an HTML field, so the MAIN-world patch escapes it and turns
   * newlines into breaks — the caller never has to know the field's storage format.
   */
  comment?: string;
  /**
   * The value `field` held when this change was computed from it.
   *
   * Supplying it authorizes ONE rebase-and-retry when the `rev` guard above is refused: the item is
   * re-read, and the write is retried against the server's current rev **only** if the field still
   * holds this value. That is what keeps an edit alive across the rev bumps nothing reports back — a
   * drag-reorder, the rank fallback, a note posted through the comments API — without ever
   * overwriting a concurrent change to the very field being written, which is still reported as the
   * conflict it is. Omit it (the default) to keep the strict "one attempt, no rebase" behaviour.
   */
  baseValue?: string | null;
}

/**
 * The result of writing a work item field: success or failure, plus the item's new rev on success so
 * the caller can update its cached copy without refetching the whole item.
 */
export interface WorkItemFieldWriteResult {
  /** Whether the write succeeded; false means an error was logged. */
  ok: boolean;
  /** The item's new System.Rev after a successful write; undefined on failure. */
  rev?: number;
  /** A short error description when ok is false. */
  error?: string;
}

/**
 * Writes a single work item field back to Azure DevOps.
 *
 * The contract is kept abstract so the view depends on this interface (Dependency Inversion): the
 * real implementation injects a credentialed fetch into the ADO tab's MAIN (page) world (the only
 * context that can access the APIs with the user's session cookies), and a test fake returns canned
 * results. The write uses JSON Patch with a rev test-and-set: the operation is atomic at the REST
 * level and fails when the item's rev has advanced since the caller last saw it (someone edited it
 * concurrently), so the caller either retries after refetching or reports the stale-rev conflict.
 */
export interface IWorkItemFieldWriter {
  writeField(request: WorkItemFieldWriteRequest): Promise<WorkItemFieldWriteResult>;
}
