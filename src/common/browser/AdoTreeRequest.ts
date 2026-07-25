import type { AdoRawTree } from "../ado/fetchAdoTree";

/**
 * The content→background message contract for loading a query's work-item tree.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * fetch the credentialed ADO REST API itself (CORS-blocked, and a same-origin fetch from the
 * extension page would drop ADO's session cookies). Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side asks it to do so and hand
 * back the raw bodies for parsing. Keeping the message shape here means both ends agree on one
 * contract instead of drifting apart.
 */
export const LOAD_QUERY_TREE_MESSAGE = "awesomeado:load-query-tree";

export interface LoadQueryTreeMessage {
  type: typeof LOAD_QUERY_TREE_MESSAGE;
  queryId: string;
  fields: string[];
}

export interface LoadQueryTreeResponse {
  raw: AdoRawTree | null;
}

export function isLoadQueryTreeMessage(value: unknown): value is LoadQueryTreeMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<LoadQueryTreeMessage>;
  return (
    candidate.type === LOAD_QUERY_TREE_MESSAGE &&
    typeof candidate.queryId === "string" &&
    Array.isArray(candidate.fields) &&
    candidate.fields.every((field) => typeof field === "string")
  );
}
