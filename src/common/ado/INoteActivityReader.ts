/**
 * Reads only the DATE of each work item's newest discussion comment, in bulk.
 *
 * Deliberately separate from `IWorkItemNoteLoader` (Interface Segregation): that one fetches one
 * item's notes to SHOW them — their text, their authors, their rendered HTML, plus the signed-in
 * identity so the reader's own can be edited. This one answers a single yes/no-shaped question about
 * many items at once ("when was each of these last talked about?"), and none of that payload helps
 * it. Asking the note loader instead cost two credentialed fetches and up to 200 fully-rendered
 * comments PER ITEM, one round-trip at a time, to look at a single timestamp.
 */

/** Which items to ask about. The caller narrows this to items ADO says have a discussion at all. */
export interface NoteActivityRequest {
  workItemIds: number[];
}

/** When one item was last commented on. */
export interface NoteActivity {
  workItemId: number;
  /**
   * ISO 8601 timestamp of the item's newest comment, or `null` when it has none.
   *
   * An item whose read FAILED is absent from the result entirely rather than reported as `null`, so
   * "nobody has commented" can never be confused with "nobody could find out".
   */
  newestNoteDate: string | null;
}

/** What one bulk read established, and whether any of it was lost. */
export interface NoteActivityResult {
  /** One entry per item that was read successfully; items whose read failed are omitted. */
  activity: NoteActivity[];
  /** A short description of why some or all of the read failed; null when nothing was lost. */
  error: string | null;
}

/**
 * Reads the newest-comment date for many work items at once.
 *
 * Abstract so a view depends on this contract rather than on messaging or on ADO's wire format
 * (Dependency Inversion): the real implementation asks the background worker to run ONE credentialed
 * MAIN-world script that fetches them all, and a test fake returns canned dates.
 */
export interface INoteActivityReader {
  readNoteActivity(request: NoteActivityRequest): Promise<NoteActivityResult>;
}
