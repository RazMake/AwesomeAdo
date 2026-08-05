import type { IWorkItemCreator, WorkItemCreateResult } from "../ado/IWorkItemCreator";
import type { NewWorkItem } from "../ado/createWorkItem";
import type { ILogger } from "../logging/ILogger";

import {
  CREATE_WORK_ITEM_MESSAGE,
  type CreateWorkItemMessage,
  type CreateWorkItemResponse,
} from "./CreateWorkItemRequest";
import { workerReplyProblem } from "./workerReply";

/** Sends a create-work-item request and resolves the background worker's reply, if any. */
export type SendCreateWorkItemRequest = (
  message: CreateWorkItemMessage,
) => Promise<CreateWorkItemResponse | undefined>;

/** The new item as the worker takes it: every optional value stated, so none is silently dropped. */
function requestFor(item: NewWorkItem): CreateWorkItemMessage {
  return {
    type: CREATE_WORK_ITEM_MESSAGE,
    itemType: item.type,
    title: item.title,
    tags: [...item.tags],
    areaPath: item.areaPath,
    iterationPath: item.iterationPath,
    assignedTo: item.assignedTo ?? null,
    description: item.description ?? null,
    comment: item.comment ?? null,
    parentId: item.parentId ?? null,
  };
}

/**
 * Creates work items by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `CreateWorkItemRequest`), so this creator hands the type, title, tags, and paths to the worker
 * and awaits the result. `send` is injected so this class never touches `chrome.runtime` itself
 * (Dependency Inversion).
 */
export class MessagingWorkItemCreator implements IWorkItemCreator {
  constructor(
    private readonly send: SendCreateWorkItemRequest,
    private readonly logger: ILogger,
  ) {}

  async create(item: NewWorkItem): Promise<WorkItemCreateResult> {
    try {
      const response = await this.send(requestFor(item));
      if (response === undefined || response === null) {
        this.logger.error(`Could not create a ${item.type}: ${workerReplyProblem(response)}.`);
        return { ok: false, error: workerReplyProblem(response) };
      }
      if (!response.ok) {
        this.logger.error(`Could not create a ${item.type}: ${response.error ?? "unknown error"}.`);
        return { ok: false, error: response.error };
      }
      // The title is deliberately NOT logged: the diagnostics log is exported with bug reports, and
      // a work item title routinely names a customer or an unannounced feature (AGENTS.md §9).
      this.logger.info(
        `Created ${item.type} ${response.id ?? "?"} with ${item.tags.length} tag(s) under parent ` +
          `${item.parentId ?? "(none)"}`,
      );
      return response;
    } catch (error) {
      this.logger.error(`Could not create a ${item.type}`, error);
      return { ok: false, error: String(error) };
    }
  }
}
