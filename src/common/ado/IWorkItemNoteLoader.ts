import type { NoteAuthor, WorkItemNote } from "./WorkItemNote";

/** What to read: one work item's discussion, no further back than the view's Updates window. */
export interface WorkItemNotesRequest {
  workItemId: number;
  /**
   * ISO 8601 start of the Updates window; notes older than this are dropped. Supplied by the caller
   * rather than derived here so the window the view configured is the one that is applied.
   */
  sinceIso: string;
}

/**
 * One item's notes, plus who is reading them.
 *
 * The reader travels WITH the notes on purpose: a view can only offer "edit" on the notes the
 * signed-in person wrote, and Azure DevOps answers "who am I" from the same credentialed page
 * context the notes are fetched in. Splitting it into its own round-trip would double the messaging
 * hops for a fact that is useless without the notes it qualifies.
 */
export interface WorkItemNotesResult {
  notes: WorkItemNote[];
  /** The signed-in ADO user, or null when the identity could not be read (no note is editable then). */
  currentUser: NoteAuthor | null;
  /** A short description of why the read failed; null on success (an item with no notes is a success). */
  error: string | null;
}

/**
 * Loads a work item's discussion notes.
 *
 * Abstract so a view depends on this contract rather than on messaging or on ADO's wire format
 * (Dependency Inversion): the real implementation asks the background worker to run a credentialed
 * MAIN-world fetch, and a test fake returns canned notes.
 */
export interface IWorkItemNoteLoader {
  loadNotes(request: WorkItemNotesRequest): Promise<WorkItemNotesResult>;
}
