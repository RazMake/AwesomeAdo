import { parseSupportedAdoUrl } from "./AdoHost";

export const ADO_NAVIGATION_MESSAGE = "awesomeado:navigation";

export interface AdoNavigationMessage {
  type: typeof ADO_NAVIGATION_MESSAGE;
  url: string;
}

export function isAdoNavigationMessage(value: unknown): value is AdoNavigationMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<AdoNavigationMessage>;
  return candidate.type === ADO_NAVIGATION_MESSAGE && typeof candidate.url === "string";
}

export function isAdoQueryUrl(rawUrl: string): boolean {
  const url = parseSupportedAdoUrl(rawUrl);
  return (
    url !== null && url.pathname.split("/").some((segment) => segment.toLowerCase() === "_queries")
  );
}

// ADO identifies a saved query by a GUID that follows the `query` or `query-edit` action segment,
// e.g. `/_queries/query/{guid}`. Folder/list routes (`_queries/all`, `_queries/favorites`) carry no
// such GUID, so they resolve to null and never offer a per-query binding.
const QUERY_ACTIONS = new Set(["query", "query-edit"]);
const QUERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the GUID identifying the specific saved query a hosted ADO URL points at, or null when
 * the URL is not a single-query route. This is stricter than isAdoQueryUrl on purpose: bindings key
 * off a concrete query id, so query folders and list views must not resolve to one.
 */
export function parseAdoQueryId(rawUrl: string): string | null {
  const url = parseSupportedAdoUrl(rawUrl);
  if (url === null) {
    return null;
  }
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const queriesIndex = segments.findIndex((segment) => segment.toLowerCase() === "_queries");
  if (queriesIndex === -1) {
    return null;
  }
  const action = segments[queriesIndex + 1]?.toLowerCase();
  const candidate = segments[queriesIndex + 2];
  if (action === undefined || !QUERY_ACTIONS.has(action) || candidate === undefined) {
    return null;
  }
  const decoded = decodeURIComponent(candidate);
  // Lowercase so the same query always keys to one binding regardless of how ADO cased the GUID.
  return QUERY_ID_PATTERN.test(decoded) ? decoded.toLowerCase() : null;
}
