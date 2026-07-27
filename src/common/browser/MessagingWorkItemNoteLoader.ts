import type {
  IWorkItemNoteLoader,
  WorkItemNotesRequest,
  WorkItemNotesResult,
} from "../ado/IWorkItemNoteLoader";
import { parseCurrentUser, parseWorkItemNotes } from "../ado/fetchWorkItemNotes";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_WORK_ITEM_NOTES_MESSAGE,
  type LoadWorkItemNotesMessage,
  type LoadWorkItemNotesResponse,
} from "./WorkItemNoteRequest";

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
        //
        // A response of `undefined` specifically means NO listener in the worker claimed the
        // message — the worker now answers even a malformed one with a reason, so the only ways
        // left to get here are a worker running older code than this page (the extension was
        // reloaded or updated while the tab stayed open) or one that failed to start at all. Say so,
        // because "no response" alone sends the reader looking for a network fault that is not there.
        const error =
          response?.error ??
          "the background worker did not handle the request — it is running older code than this " +
            "page (reload the ADO tab) or failed to start (check the extension's service worker)";
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
