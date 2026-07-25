import type { IWorkItemTreeLoader, WorkItemTreeResult } from "../ado/IWorkItemTreeLoader";
import { parseTrackedTree, TRACKING_FIELDS } from "../ado/fetchAdoTree";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_QUERY_TREE_MESSAGE,
  type LoadQueryTreeMessage,
  type LoadQueryTreeResponse,
} from "./AdoTreeRequest";

/** Sends a load-query-tree request and resolves the background worker's reply, if any. */
export type SendTreeRequest = (
  message: LoadQueryTreeMessage,
) => Promise<LoadQueryTreeResponse | undefined>;

const LOAD_FAILURE_ERROR = "Could not load this query from Azure DevOps.";

/**
 * Loads a query's work-item tree by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `AdoTreeRequest`'s doc comment), so this loader hands the query id and desired fields to the
 * worker and parses whatever raw bodies come back. The `send` function is injected so this class
 * never touches `chrome.runtime` itself (Dependency Inversion) — the composition root supplies the
 * real `chrome.runtime.sendMessage` binding, and a test supplies a fake.
 */
export class MessagingWorkItemTreeLoader implements IWorkItemTreeLoader {
  constructor(
    private readonly send: SendTreeRequest,
    private readonly getEtaFieldByType: () => ReadonlyMap<string, string>,
    private readonly logger: ILogger,
  ) {}

  async loadTree(queryId: string): Promise<WorkItemTreeResult> {
    const etaFieldByType = this.getEtaFieldByType();
    const fields = Array.from(new Set([...TRACKING_FIELDS, ...etaFieldByType.values()]));

    try {
      const response = await this.send({ type: LOAD_QUERY_TREE_MESSAGE, queryId, fields });
      if (response === undefined || response === null || response.raw === null) {
        this.logger.error(`Could not load query tree for ${queryId}: no data returned.`);
        return { isTreeQuery: false, roots: [], error: LOAD_FAILURE_ERROR };
      }

      const result = parseTrackedTree(response.raw, etaFieldByType);
      this.logger.info(`Loaded query tree for ${queryId}: ${result.roots.length} root(s).`);
      return result;
    } catch (error) {
      this.logger.error(`Could not load query tree for ${queryId}`, error);
      return { isTreeQuery: false, roots: [], error: LOAD_FAILURE_ERROR };
    }
  }
}
