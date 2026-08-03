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
