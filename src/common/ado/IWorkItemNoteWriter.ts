import type { WorkItemNote } from "./WorkItemNote";

/** A new note to file under a work item's discussion. */
export interface AddNoteRequest {
  workItemId: number;
  /** The note's Markdown source, exactly as the author typed it. */
  text: string;
}

/** A correction to a note the signed-in person already posted. */
export interface EditNoteRequest {
  workItemId: number;
  /** The comment id being rewritten — Azure DevOps only lets its original author change it. */
  noteId: number;
  text: string;
}

/**
 * The outcome of writing a note.
 *
 * The saved note comes back on success so the list can show exactly what ADO stored (including the
 * rendering it produced), rather than echoing the text the author typed and drifting from it.
 */
export interface NoteWriteResult {
  ok: boolean;
  note?: WorkItemNote;
  /**
   * The item's `System.Rev` once the note had landed; absent when it could not be read.
   *
   * A note is not a side conversation: Azure DevOps records it as a work item REVISION, so an item
   * whose cached rev is not moved on here has every later field write refused as a conflict against
   * a change the same person just made. Callers holding the item fold this back onto it.
   */
  rev?: number;
  /** A short error description when `ok` is false. */
  error?: string;
}

/**
 * Writes work item discussion notes.
 *
 * Kept separate from `IWorkItemNoteLoader` (Interface Segregation): a view that only shows notes has
 * no business depending on the ability to post them, and the read path is available to everyone
 * while the write path is not.
 */
export interface IWorkItemNoteWriter {
  addNote(request: AddNoteRequest): Promise<NoteWriteResult>;
  editNote(request: EditNoteRequest): Promise<NoteWriteResult>;
}
