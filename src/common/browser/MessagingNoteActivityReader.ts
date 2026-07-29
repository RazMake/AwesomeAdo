import type {
  INoteActivityReader,
  NoteActivityRequest,
  NoteActivityResult,
} from "../ado/INoteActivityReader";
import type { ILogger } from "../logging/ILogger";

import {
  READ_NOTE_ACTIVITY_MESSAGE,
  type ReadNoteActivityMessage,
  type ReadNoteActivityResponse,
} from "./NoteActivityRequest";
import { workerReplyProblem } from "./workerReply";

/** Sends a note-activity request and resolves the background worker's reply, if any. */
export type SendNoteActivityRequest = (
  message: ReadNoteActivityMessage,
) => Promise<ReadNoteActivityResponse | undefined>;

/**
 * Reads the newest-comment date of many work items by messaging the background service worker.
 *
 * The content side cannot fetch the credentialed ADO REST API itself (see `NoteActivityRequest`), so
 * it asks the worker for the raw result and shapes it here. The `send` function is injected so this
 * class never touches `chrome.runtime` itself (Dependency Inversion).
 */
export class MessagingNoteActivityReader implements INoteActivityReader {
  constructor(
    private readonly send: SendNoteActivityRequest,
    private readonly logger: ILogger,
  ) {}

  async readNoteActivity(request: NoteActivityRequest): Promise<NoteActivityResult> {
    if (request.workItemIds.length === 0) {
      // Nothing to ask about is a complete answer, not a round-trip: the caller is allowed to hand
      // over an empty list when every item's date is already known.
      return { activity: [], error: null };
    }
    const message: ReadNoteActivityMessage = {
      type: READ_NOTE_ACTIVITY_MESSAGE,
      workItemIds: request.workItemIds,
      excludedPrefixes: request.excludedPrefixes,
    };

    try {
      const response = await this.send(message);
      if (response === undefined || response === null || response.raw === null) {
        const error = workerReplyProblem(response);
        this.logger.error(
          `Note-activity read failed for ${message.workItemIds.length} item(s): ${error}.`,
        );
        return { activity: [], error };
      }

      const { newest, failedIds, failure, status } = response.raw;
      // A PARTIAL answer is still worth keeping: the items that were read narrow the board
      // correctly, and the ones that were not simply stay unclaimed. Reporting the error alongside
      // them is what stops a partial failure from looking like a complete, quiet one.
      const error = failure === "none" ? null : `${failure} (HTTP ${status})`;
      if (error !== null) {
        this.logger.error(
          `Note-activity read lost ${failedIds.length} of ${message.workItemIds.length} item(s): ${error}.`,
        );
      }
      // Counts only — never a comment's text or an author's name (AGENTS.md §9).
      this.logger.info(
        `Note activity read for ${message.workItemIds.length} item(s): dated=${newest.length}, ` +
          `failed=${failedIds.length}.`,
      );
      return { activity: newest, error };
    } catch (error) {
      this.logger.error(
        `Could not read note activity for ${message.workItemIds.length} item(s)`,
        error,
      );
      return { activity: [], error: "could not reach Azure DevOps" };
    }
  }
}
