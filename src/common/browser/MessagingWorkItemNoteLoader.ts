import type {
  IWorkItemNoteLoader,
  WorkItemNotesRequest,
  WorkItemNotesResult,
} from "../ado/IWorkItemNoteLoader";
import { parseCurrentUser } from "../ado/currentUser";
import { parseWorkItemNotes } from "../ado/fetchWorkItemNotes";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_WORK_ITEM_NOTES_MESSAGE,
  type LoadWorkItemNotesMessage,
  type LoadWorkItemNotesResponse,
} from "./WorkItemNoteRequest";
import { workerReplyProblem } from "./workerReply";

/** Sends a load-notes request and resolves the background worker's reply, if any. */
export type SendNotesRequest = (
  message: LoadWorkItemNotesMessage,
) => Promise<LoadWorkItemNotesResponse | undefined>;

/**
 * Loads a work item's discussion notes by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `WorkItemNoteRequest`'s doc comment), so this loader asks the worker for the raw bodies and parses
 * them here — the parse belongs on the content side because the worker has no reason to know the
 * view's model. The `send` function is injected so this class never touches `chrome.runtime` itself
 * (Dependency Inversion).
 */
export class MessagingWorkItemNoteLoader implements IWorkItemNoteLoader {
  constructor(
    private readonly send: SendNotesRequest,
    private readonly logger: ILogger,
  ) {}

  async loadNotes(request: WorkItemNotesRequest): Promise<WorkItemNotesResult> {
    const message: LoadWorkItemNotesMessage = {
      type: LOAD_WORK_ITEM_NOTES_MESSAGE,
      workItemId: request.workItemId,
      sinceIso: request.sinceIso,
    };

    try {
      const response = await this.send(message);
      if (response === undefined || response === null || response.raw === null) {
        // A failed read and an empty discussion must not look alike: an error leaves the panel able
        // to say so instead of claiming there is nothing to read.
        const error = workerReplyProblem(response);
        this.logger.error(`Notes load failed for work item ${request.workItemId}: ${error}.`);
        return { notes: [], currentUser: null, error };
      }

      if (response.raw.failure !== "none") {
        // The classification is the whole point: "sign-in" tells the reader to re-authenticate,
        // where a bare empty list would have told them this item has no discussion.
        const error = `${response.raw.failure} (HTTP ${response.raw.status})`;
        this.logger.error(`Notes load failed for work item ${request.workItemId}: ${error}.`);
        return { notes: [], currentUser: null, error };
      }

      const notes = parseWorkItemNotes(response.raw.pages, request.workItemId, request.sinceIso);
      const currentUser = parseCurrentUser(response.raw.connection);
      if (response.raw.connectionFailure !== "none") {
        // Logged as an ERROR even though the notes themselves arrived: this is the difference
        // between "you have written no notes here" and "the extension could not find out who you
        // are", and without it a board where nothing is editable leaves no trace to follow at all.
        this.logger.error(
          `Could not read the signed-in identity while loading notes for work item ` +
            `${request.workItemId}: ${response.raw.connectionFailure} ` +
            `(HTTP ${response.raw.connectionStatus}). Every note stays read-only until it succeeds.`,
        );
      }
      // Counts and the window only — never a note's text or an author's name. The diagnostics log is
      // exported into bug reports (AGENTS.md §9), and a discussion routinely names people and
      // customers.
      this.logger.info(
        `Notes loaded for work item ${request.workItemId}: notes=${notes.length}, ` +
          `since=${request.sinceIso}, identifiedReader=${currentUser !== null}.`,
      );
      return { notes, currentUser, error: null };
    } catch (error) {
      this.logger.error(`Could not load notes for work item ${request.workItemId}`, error);
      return { notes: [], currentUser: null, error: "could not reach Azure DevOps" };
    }
  }
}
