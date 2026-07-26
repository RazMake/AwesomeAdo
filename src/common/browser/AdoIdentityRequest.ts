/**
 * The content→background message contract for searching Azure DevOps identities.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * reach the credentialed ADO REST API itself (CORS-blocked; a same-origin fetch from the extension
 * page drops ADO's SameSite session cookies). Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side names the text the user
 * typed and the worker hands back the raw body for parsing. Keeping the shape here means both ends
 * agree on one contract instead of drifting apart. The query is content-supplied, but the request
 * URL is still built background-side from the SENDER's trusted tab URL, so this stays a closed
 * "search this organization's people" operation, not a fetch-any-URL proxy.
 */
export const SEARCH_ADO_IDENTITIES_MESSAGE = "awesomeado:search-ado-identities";

export interface SearchAdoIdentitiesMessage {
  type: typeof SEARCH_ADO_IDENTITIES_MESSAGE;
  /** The text the user typed into a people picker. */
  query: string;
}

export interface SearchAdoIdentitiesResponse {
  /** The raw `_apis/IdentityPicker/Identities` body, or null on any failure. */
  raw: unknown;
}

export function isSearchAdoIdentitiesMessage(value: unknown): value is SearchAdoIdentitiesMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SearchAdoIdentitiesMessage>;
  return candidate.type === SEARCH_ADO_IDENTITIES_MESSAGE && typeof candidate.query === "string";
}
