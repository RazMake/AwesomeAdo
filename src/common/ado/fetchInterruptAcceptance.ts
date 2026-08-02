import { ADO_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

/** One bulk request is bounded because each id becomes a paged ADO updates read. */
export const MAX_INTERRUPT_ACCEPTANCE_ITEMS = 500;
export const INTERRUPT_UPDATES_PAGE_SIZE = 200;
export const MAX_INTERRUPT_UPDATE_PAGES = 50;
export const MAX_INTERRUPT_MARKER_LENGTH = 200;

export interface InterruptAcceptanceUrls {
  updatesUrl: string;
}

/** Builds the updates collection from the sender tab's trusted ADO project location. */
export function buildInterruptAcceptanceUrls(
  href: string,
  workItemId: number,
): InterruptAcceptanceUrls | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) return null;
  return {
    updatesUrl:
      `${resolved.base}/${resolved.project}/_apis/wit/workItems/${workItemId}/updates` +
      `?api-version=${ADO_API_VERSION}&$top=${INTERRUPT_UPDATES_PAGE_SIZE}&$skip=0`,
  };
}
