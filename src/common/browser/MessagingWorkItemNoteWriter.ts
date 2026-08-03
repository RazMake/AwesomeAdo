import type {
  AddNoteRequest,
  EditNoteRequest,
  IWorkItemNoteWriter,
  NoteWriteResult,
} from "../ado/IWorkItemNoteWriter";
import { parseWorkItemNote } from "../ado/fetchWorkItemNotes";
import type { ILogger } from "../logging/ILogger";

import {
  WRITE_WORK_ITEM_NOTE_MESSAGE,
  type WriteWorkItemNoteMessage,
  type WriteWorkItemNoteResponse,
} from "./WorkItemNoteRequest";

/** Sends a write-note request and resolves the background worker's reply, if any. */
export type SendNoteWriteRequest = (
  message: WriteWorkItemNoteMessage,
) => Promise<WriteWorkItemNoteResponse | undefined>;

/**
 * Posts and edits work item discussion notes by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `WorkItemNoteRequest`'s doc comment), so this writer hands the worker the item, the optional
 * comment id and the Markdown, then parses the saved comment back into the view's model. The `send`
 * function is injected so this class never touches `chrome.runtime` itself (Dependency Inversion).
 */
export class MessagingWorkItemNoteWriter implements IWorkItemNoteWriter {
  constructor(
    private readonly send: SendNoteWriteRequest,
    private readonly logger: ILogger,
  ) {}

  addNote(request: AddNoteRequest): Promise<NoteWriteResult> {
    return this.write(request.workItemId, null, request.text);
  }

  editNote(request: EditNoteRequest): Promise<NoteWriteResult> {
    return this.write(request.workItemId, request.noteId, request.text);
  }

  /**
   * The single round-trip both operations share: they differ only in whether a comment id is named,
   * and duplicating the messaging, logging and parse for that one difference is how the two ends
   * drift apart.
   */
  private async write(
    workItemId: number,
    noteId: number | null,
    text: string,
  ): Promise<NoteWriteResult> {
    const message: WriteWorkItemNoteMessage = {
      type: WRITE_WORK_ITEM_NOTE_MESSAGE,
      workItemId,
      noteId,
      text,
    };
    const what = noteId === null ? "add" : `edit ${noteId}`;

    try {
      const response = await this.send(message);
      if (response === undefined || response === null) {
        // `undefined` means NO listener in the worker claimed the message. The worker answers even a
        // malformed one with a reason, so what is left is a worker running older code than this page
        // (reloaded/updated while the tab stayed open) or one that failed to start — name both,
        // rather than reporting a bare "no response" that reads like a network fault.
        const error =
          "the background worker did not handle the request — it is running older code than this " +
          "page (reload the ADO tab) or failed to start (check the extension's service worker)";
        this.logger.error(`Note ${what} on work item ${workItemId}: ${error}.`);
        return { ok: false, error };
      }
      if (!response.ok) {
        this.logger.error(
          `Note ${what} on work item ${workItemId} failed: ${response.error ?? "unknown error"}.`,
        );
        return { ok: false, error: response.error };
      }
      // A note ADO accepted but returned unparseably is still saved, so this reports success — the
      // caller reloads rather than being told an applied write failed. Never log the text itself
      // (AGENTS.md §9): a note routinely names people and customers.
      const note = parseWorkItemNote(response.raw, workItemId) ?? undefined;
      this.logger.info(
        `Note ${what} on work item ${workItemId} saved (parsed=${note !== undefined}, ` +
          `rev=${response.rev ?? "unknown"}).`,
      );
      return { ok: true, note, rev: response.rev };
    } catch (error) {
      this.logger.error(`Could not ${what} a note on work item ${workItemId}`, error);
      return { ok: false, error: "could not reach Azure DevOps" };
    }
  }
}
