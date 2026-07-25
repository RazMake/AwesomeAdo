import type {
  IWorkItemStateWriter,
  WorkItemStateWriteRequest,
  WorkItemStateWriteResult,
} from "../ado/IWorkItemStateWriter";
import type { ILogger } from "../logging/ILogger";

import {
  UPDATE_WORK_ITEM_STATE_MESSAGE,
  type UpdateWorkItemStateMessage,
  type UpdateWorkItemStateResponse,
} from "./WorkItemStateRequest";

/** Sends an update-work-item-state request and resolves the background worker's reply, if any. */
export type SendUpdateStateRequest = (
  message: UpdateWorkItemStateMessage,
) => Promise<UpdateWorkItemStateResponse | undefined>;

/**
 * Writes a work item's state by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `WorkItemStateRequest`'s doc comment), so this writer hands the id, rev, and state to the worker
 * and awaits the result. The `send` function is injected so this class never touches
 * `chrome.runtime` itself (Dependency Inversion) — the composition root supplies the real
 * `chrome.runtime.sendMessage` binding, and a test supplies a fake.
 */
export class MessagingWorkItemStateWriter implements IWorkItemStateWriter {
  constructor(
    private readonly send: SendUpdateStateRequest,
    private readonly logger: ILogger,
  ) {}

  async writeState(request: WorkItemStateWriteRequest): Promise<WorkItemStateWriteResult> {
    const message: UpdateWorkItemStateMessage = {
      type: UPDATE_WORK_ITEM_STATE_MESSAGE,
      id: request.id,
      rev: request.rev,
      state: request.state,
    };

    try {
      const response = await this.send(message);

      if (response === undefined || response === null) {
        this.logger.error(`Work item ${request.id} state write: no response from background.`);
        return { ok: false };
      }

      if (response.ok === false) {
        this.logger.error(
          `Work item ${request.id} state write failed: ${response.error ?? "unknown error"}.`,
        );
        return { ok: false, rev: response.rev, error: response.error };
      }

      this.logger.info(
        `Work item ${request.id} state written to ${request.state}, rev=${response.rev ?? "none"}.`,
      );
      return { ok: true, rev: response.rev };
    } catch (error) {
      this.logger.error(`Could not write state for work item ${request.id}`, error);
      return { ok: false };
    }
  }
}
