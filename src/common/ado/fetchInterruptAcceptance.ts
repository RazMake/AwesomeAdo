import { ADO_API_VERSION, ADO_COMMENTS_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";
import { buildWorkItemCommentsUrl, NOTES_PAGE_SIZE } from "./fetchWorkItemNotes";

/** One bulk request is bounded because each id becomes a paged ADO updates read. */
export const MAX_INTERRUPT_ACCEPTANCE_ITEMS = 500;
export const INTERRUPT_UPDATES_PAGE_SIZE = 200;
export const MAX_INTERRUPT_UPDATE_PAGES = 50;
export const MAX_INTERRUPT_COMMENT_PAGES = 50;
export const MAX_INTERRUPT_MARKER_LENGTH = 200;

export interface InterruptAcceptanceUrls {
  updatesUrl: string;
  commentsUrl: string;
}

/** Builds the update and Discussion collections from the sender tab's trusted ADO project location. */
export function buildInterruptAcceptanceUrls(
  href: string,
  workItemId: number,
): InterruptAcceptanceUrls | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) return null;
  const commentsUrl = buildWorkItemCommentsUrl(
    href,
    workItemId,
    `?api-version=${ADO_COMMENTS_API_VERSION}&$top=${NOTES_PAGE_SIZE}&order=desc`,
  );
  if (commentsUrl === null) return null;
  return {
    updatesUrl:
      `${resolved.base}/${resolved.project}/_apis/wit/workItems/${workItemId}/updates` +
      `?api-version=${ADO_API_VERSION}&$top=${INTERRUPT_UPDATES_PAGE_SIZE}&$skip=0`,
    commentsUrl,
  };
}
