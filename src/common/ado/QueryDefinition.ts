import { ADO_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

export interface QueryDefinitionResult {
  wiql: string | null;
  error: string | null;
}

/** Build the expanded saved-query URL used to read its original WIQL text. */
export function buildAdoQueryDefinitionUrl(href: string, queryId: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) return null;
  return `${resolved.base}/${resolved.project}/_apis/wit/queries/${encodeURIComponent(queryId)}?$expand=wiql&api-version=${ADO_API_VERSION}`;
}

/** Read the immutable WIQL source from an expanded query hierarchy item. */
export function parseQueryDefinition(raw: unknown): string | null {
  const wiql = (raw as { wiql?: unknown } | null)?.wiql;
  return typeof wiql === "string" && wiql.trim().length > 0 ? wiql : null;
}

/**
 * The ancestor folders of a query's `path`, outermost first, with the query's own name dropped.
 *
 * ADO spells a query's location with EITHER separator depending on the endpoint, and always ends it
 * with the query itself, so both readers of a query path split it the same way here rather than each
 * re-deriving a rule that a single inconsistent response would break.
 */
export function queryPathFolderSegments(path: unknown): string[] {
  if (typeof path !== "string") {
    return [];
  }
  const segments = path.split(/[/\\]/).filter((segment) => segment.length > 0);
  segments.pop();
  return segments;
}

/**
 * The folder a saved query lives in, spelled the way ADO's query hierarchy reports a folder path
 * (forward slashes, built-in root container included), or null when the body names no folder.
 *
 * The built-in root ("Shared Queries"/"My Queries") is KEPT: a query filed directly under it really
 * does live there, and that is the folder a sibling query has to be created in.
 */
export function parseQueryFolder(raw: unknown): string | null {
  const segments = queryPathFolderSegments((raw as { path?: unknown } | null)?.path);
  return segments.length > 0 ? segments.join("/") : null;
}

/**
 * The first literal tag a WIQL tag-membership clause requires, as Azure DevOps spells it.
 *
 * Only the membership operators are read. A plain `=` compares against the item's WHOLE
 * semicolon-separated tag string, so treating that value as one tag would invent a tag nothing wears.
 */
export function parseQueryTagFilter(wiql: string | null): string | null {
  if (wiql === null) return null;
  const clause = /\[\s*System\.Tags\s*\]\s+CONTAINS(?:\s+WORDS)?\s+'((?:''|[^'])+)'/i.exec(wiql);
  const tag = clause?.[1]?.replace(/''/g, "'").trim() ?? "";
  return tag.length > 0 ? tag : null;
}
