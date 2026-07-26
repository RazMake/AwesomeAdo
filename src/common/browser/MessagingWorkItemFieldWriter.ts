import type {
  IWorkItemFieldWriter,
  WorkItemFieldWriteRequest,
  WorkItemFieldWriteResult,
} from "../ado/IWorkItemFieldWriter";
import type { ILogger } from "../logging/ILogger";

import {
  UPDATE_WORK_ITEM_FIELD_MESSAGE,
  type UpdateWorkItemFieldMessage,
  type UpdateWorkItemFieldResponse,
} from "./WorkItemFieldRequest";

/** Sends an update-work-item-field request and resolves the background worker's reply, if any. */
export type SendUpdateFieldRequest = (
  message: UpdateWorkItemFieldMessage,
) => Promise<UpdateWorkItemFieldResponse | undefined>;

/**
 * Writes a work item field by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `WorkItemFieldRequest`'s doc comment), so this writer hands the id, rev, field, and value to the
 * worker and awaits the result. The `send` function is injected so this class never touches
 * `chrome.runtime` itself (Dependency Inversion) — the composition root supplies the real
 * `chrome.runtime.sendMessage` binding, and a test supplies a fake.
 */
export class MessagingWorkItemFieldWriter implements IWorkItemFieldWriter {
  constructor(
    private readonly send: SendUpdateFieldRequest,
    private readonly logger: ILogger,
  ) {}

  async writeField(request: WorkItemFieldWriteRequest): Promise<WorkItemFieldWriteResult> {
    const message: UpdateWorkItemFieldMessage = {
      type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
      id: request.id,
      rev: request.rev,
      field: request.field,
      value: request.value,
    };

    try {
      const response = await this.send(message);

      if (response === undefined || response === null) {
        this.logger.error(`Work item ${request.id} field write: no response from background.`);
        return { ok: false };
      }

      if (response.ok === false) {
        this.logger.error(
          `Work item ${request.id} field write failed: ${response.error ?? "unknown error"}.`,
        );
        return { ok: false, rev: response.rev, error: response.error };
      }

      this.logger.info(
        `Work item ${request.id} field ${request.field} written, rev=${response.rev ?? "none"}.`,
      );
      return { ok: true, rev: response.rev };
    } catch (error) {
      this.logger.error(
        `Could not write field ${request.field} for work item ${request.id}`,
        error,
      );
      return { ok: false };
    }
  }
}
