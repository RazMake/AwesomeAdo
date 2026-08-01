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
