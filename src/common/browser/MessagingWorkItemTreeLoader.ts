import type { IWorkItemTreeLoader, WorkItemTreeResult } from "../ado/IWorkItemTreeLoader";
import type { AdoRawTree } from "../ado/fetchAdoTree";
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

function treeMessage(queryId: string, fields: string[], wiql?: string): LoadQueryTreeMessage {
  return {
    type: LOAD_QUERY_TREE_MESSAGE,
    queryId,
    fields,
    ...(wiql === undefined ? {} : { wiql }),
  };
}

/** Log the specific read/parse failure once and tell the caller whether loading must stop. */
function logTreeFailure(
  logger: ILogger,
  queryId: string,
  raw: AdoRawTree,
  result: WorkItemTreeResult,
): boolean {
  const readFailure = raw.failure;
  if (readFailure !== undefined) {
    const outcome = readFailure.status === 0 ? "no HTTP response" : `HTTP ${readFailure.status}`;
    logger.error(
      `Could not load query tree for ${queryId}: ${readFailure.stage} request failed (${outcome}).`,
      readFailure,
    );
    return true;
  }
  if (result.error !== null) {
    logger.error(
      `Could not load query tree for ${queryId}: Azure DevOps returned incomplete or malformed tree data.`,
    );
    return true;
  }
  return false;
}

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

  async loadTree(queryId: string, wiql?: string): Promise<WorkItemTreeResult> {
    const etaFieldByType = this.getEtaFieldByType();
    const fields = Array.from(new Set([...TRACKING_FIELDS, ...etaFieldByType.values()]));

    try {
      const response = await this.send(treeMessage(queryId, fields, wiql));
      if (response === undefined || response === null || response.raw === null) {
        this.logger.error(`Could not load query tree for ${queryId}: no data returned.`);
        return { isTreeQuery: false, roots: [], error: LOAD_FAILURE_ERROR };
      }

      const result = parseTrackedTree(response.raw, etaFieldByType);
      if (logTreeFailure(this.logger, queryId, response.raw, result)) {
        return result;
      }
      // Record whether the query-metadata read produced a folder trail: an empty trail with no raw
      // query body means the breadcrumb hid because the metadata call came back empty, not because
      // the query truly sits at a root — the distinction is otherwise invisible in Diagnostics.
      const queryMeta = (response.raw as { query?: unknown }).query;
      const hasQueryMeta = queryMeta !== null && queryMeta !== undefined;
      this.logger.info(
        `Loaded query tree for ${queryId}: ${result.roots.length} root(s), ` +
          `folder trail [${(result.folderPath ?? []).map((crumb) => crumb.label).join(" / ") || "none"}]` +
          `${hasQueryMeta ? "" : " (no query metadata returned)"}.`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Could not load query tree for ${queryId}`, error);
      return { isTreeQuery: false, roots: [], error: LOAD_FAILURE_ERROR };
    }
  }
}
