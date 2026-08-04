import type {
  CreateProjectQueryRequest,
  CreateProjectQueryResult,
  DeleteProjectQueryRequest,
  DeleteProjectQueryResult,
  IProjectQueryService,
  ProjectQueryLinksResult,
} from "../ado/IProjectQueryService";
import { parseProjectQueryLinks } from "../ado/projectQuery";
import type { ILogger } from "../logging/ILogger";

import {
  PROJECT_QUERY_MESSAGE,
  type ProjectQueryMessage,
  type ProjectQueryResponse,
} from "./ProjectQueryRequest";
import { workerReplyProblem } from "./workerReply";

/** Sends a project-query request and resolves the background worker's reply, if any. */
export type SendProjectQueryRequest = (
  message: ProjectQueryMessage,
) => Promise<ProjectQueryResponse | undefined>;

/**
 * Manages a project's own saved tracking query by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `ProjectQueryRequest`), so every operation is forwarded to the worker, which builds the URLs from
 * the sender's own trusted tab. `send` is injected so this class never touches `chrome.runtime`
 * itself (Dependency Inversion).
 */
export class MessagingProjectQueryService implements IProjectQueryService {
  constructor(
    private readonly send: SendProjectQueryRequest,
    private readonly logger: ILogger,
  ) {}

  async readLinks(workItemIds: readonly number[]): Promise<ProjectQueryLinksResult> {
    if (workItemIds.length === 0) {
      return { links: [], error: null };
    }
    const response = await this.ask(
      { type: PROJECT_QUERY_MESSAGE, operation: "read-links", ids: [...workItemIds] },
      `read the tracking-query links of ${workItemIds.length} project(s)`,
    );
    if (!response.ok) {
      return { links: [], error: response.error ?? "unknown error" };
    }
    return { links: parseProjectQueryLinks(response.raw), error: null };
  }

  async create(request: CreateProjectQueryRequest): Promise<CreateProjectQueryResult> {
    const response = await this.ask(
      { ...request, type: PROJECT_QUERY_MESSAGE, operation: "create" },
      `create the tracking query for project ${request.projectId}`,
    );
    if (response.ok) {
      this.logger.info(
        `Created tracking query ${response.queryId ?? "?"} for project ${request.projectId}`,
      );
    }
    return response.ok
      ? { ok: true, queryId: response.queryId, rev: response.rev }
      : { ok: false, error: response.error };
  }

  async remove(request: DeleteProjectQueryRequest): Promise<DeleteProjectQueryResult> {
    const response = await this.ask(
      { ...request, type: PROJECT_QUERY_MESSAGE, operation: "remove" },
      `delete the tracking query of project ${request.projectId}`,
    );
    if (response.ok) {
      this.logger.info(
        `Unlinked and deleted tracking query ${request.queryId} of project ${request.projectId}`,
      );
    }
    return response.ok ? { ok: true, rev: response.rev } : { ok: false, error: response.error };
  }

  /**
   * One round trip, with the two failures that are invisible to the caller already logged: a worker
   * that never answered, and a worker that answered with a refusal.
   */
  private async ask(
    message: ProjectQueryMessage,
    description: string,
  ): Promise<ProjectQueryResponse> {
    try {
      const response = await this.send(message);
      if (response === undefined || response === null) {
        const error = workerReplyProblem(response);
        this.logger.error(`Could not ${description}: ${error}.`);
        return { ok: false, error };
      }
      if (!response.ok) {
        this.logger.error(`Could not ${description}: ${response.error ?? "unknown error"}.`);
      }
      return response;
    } catch (error) {
      this.logger.error(`Could not ${description}`, error);
      return { ok: false, error: String(error) };
    }
  }
}
