import type {
  IWorkItemReorderWriter,
  WorkItemReorderRequest,
  WorkItemReorderResult,
} from "../ado/IWorkItemReorderWriter";
import type { ILogger } from "../logging/ILogger";

import {
  explainReorderRefusal,
  REORDER_WORK_ITEM_MESSAGE,
  type ReorderWorkItemMessage,
  type ReorderWorkItemResponse,
} from "./WorkItemReorderRequest";

/** Sends a reorder-work-item request and resolves the background worker's reply, if any. */
export type SendReorderRequest = (
  message: ReorderWorkItemMessage,
) => Promise<ReorderWorkItemResponse | undefined>;

/**
 * Moves a work item by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `WorkItemReorderRequest`'s doc comment), so this writer hands the move to the worker and awaits
 * the result. The `send` function is injected so this class never touches `chrome.runtime` itself
 * (Dependency Inversion) — the composition root supplies the real `chrome.runtime.sendMessage`
 * binding, and a test supplies a fake.
 */
export class MessagingWorkItemReorderWriter implements IWorkItemReorderWriter {
  constructor(
    private readonly send: SendReorderRequest,
    private readonly logger: ILogger,
  ) {}

  async reorder(request: WorkItemReorderRequest): Promise<WorkItemReorderResult> {
    const message: ReorderWorkItemMessage = {
      type: REORDER_WORK_ITEM_MESSAGE,
      id: request.id,
      rev: request.rev,
      parentId: request.parentId,
      currentParentId: request.currentParentId,
      previousId: request.previousId,
      nextId: request.nextId,
      siblingIds: [...request.siblingIds],
      team: request.team,
    };
    if (request.type !== undefined) {
      message.typeName = request.type;
    }

    try {
      const response = await this.send(message);

      if (response === undefined || response === null) {
        // "No response" is the hardest failure to act on, because it is silence rather than an
        // error: the worker either has no handler for this message (an extension updated but not
        // reloaded, so the running worker predates the feature) or dropped it before replying.
        // Recording exactly what was sent lets the next reader tell those apart without a repro.
        this.logger.error(
          `Work item ${request.id} reorder: no response from the background worker. ` +
            `Sent parent ${request.currentParentId}\u2192${request.parentId}, between ` +
            `${request.previousId} and ${request.nextId}, rev ${request.rev}, ` +
            `team ${request.team.length > 0 ? "set" : "MISSING"}. ` +
            `The worker may predate this feature \u2014 reload the extension and retry.`,
        );
        return { ok: false, error: "no response from the background worker" };
      }

      if (!response.ok) {
        const reason = response.error ?? "unknown error";
        this.logger.error(`Work item ${request.id} reorder failed: ${reason}.`, response.error);
        const explanation = explainReorderRefusal(reason);
        if (explanation !== null) {
          // Beside ADO's own words, never instead of them: TF400486 names a concurrency problem that
          // is not the actual cause, so a reader given only the raw code chases the wrong theory.
          this.logger.error(`Work item ${request.id} reorder: ${explanation}`);
        }
        return { ok: false, error: response.error, reparented: response.reparented };
      }

      // The signals behind the move plus its outcome, so "why did that item end up there?" is
      // answerable from the log alone; ids only, never titles (AGENTS.md §9).
      this.logger.info(
        `Work item ${request.id} moved: parent ${request.currentParentId}→${request.parentId}, ` +
          `between ${request.previousId} and ${request.nextId}, order=${response.order ?? "unchanged"}.`,
      );
      return {
        ok: true,
        order: response.order,
        rev: response.rev,
        ranks: response.ranks,
        reparented: response.reparented,
      };
    } catch (error) {
      this.logger.error(`Could not reorder work item ${request.id}`, error);
      return { ok: false, error: "reorder request threw" };
    }
  }
}
