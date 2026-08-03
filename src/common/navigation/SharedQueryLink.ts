import { parseSupportedAdoUrl } from "./AdoHost";

/**
 * The query-string parameter a shared query URL carries to name the Azure DevOps work item its
 * configuration must be read from.
 *
 * Riding on the query URL is deliberate: the recipient opens one link and lands on the query with
 * the sender's configuration already applied, with nothing to paste into the options page. The
 * parameter names a work item id only — never configuration values — so a link can never inject
 * settings; it can only point at an item the recipient's own ADO session is allowed to read.
 */
export const SHARED_CONFIG_PARAM = "awesomeAdoConfig";

/**
 * Extract the configuration work item id a hosted ADO URL carries, or null when it carries none.
 *
 * Returns null for anything that is not a positive whole number, so a malformed or hostile value is
 * simply not a link rather than a partially-trusted one.
 */
export function parseSharedConfigWorkItemId(rawUrl: string): number | null {
  const url = parseSupportedAdoUrl(rawUrl);
  if (url === null) {
    return null;
  }
  const raw = url.searchParams.get(SHARED_CONFIG_PARAM);
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    return null;
  }
  const workItemId = Number(raw.trim());
  return Number.isSafeInteger(workItemId) && workItemId > 0 ? workItemId : null;
}

/** Everything a shareable saved-query link needs to name both the query and its configuration. */
export interface SharedQueryLinkTarget {
  organization: string;
  project: string;
  /** The saved query's GUID, as `parseAdoQueryId` reads it back out of the URL. */
  queryId: string;
  /** The work item whose Description holds the configuration to read. */
  workItemId: number;
}

/**
 * Build the shareable saved-query URL for `target`, or null when it does not fully name one.
 *
 * The inverse of {@link parseSharedConfigWorkItemId}, built from stored identity rather than from an
 * open tab's URL so a link can be offered with no Azure DevOps page open. It always addresses
 * `dev.azure.com`, which every organization answers on — including the ones their own members still
 * reach through the legacy `{org}.visualstudio.com` host — so one pasted link works for every
 * recipient regardless of which host the sender happens to browse with.
 *
 * A missing part yields null rather than a URL with a blank segment: a half-built link would look
 * shareable and silently land the recipient nowhere.
 */
export function buildSharedQueryLink(target: SharedQueryLinkTarget): string | null {
  const { organization, project, queryId, workItemId } = target;
  if (organization === "" || project === "" || queryId === "") {
    return null;
  }
  if (!Number.isSafeInteger(workItemId) || workItemId <= 0) {
    return null;
  }
  const path = [organization, project, "_queries", "query", queryId]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://dev.azure.com/${path}?${SHARED_CONFIG_PARAM}=${workItemId}`;
}
