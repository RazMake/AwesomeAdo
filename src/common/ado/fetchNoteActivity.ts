import { ADO_COMMENTS_API_VERSION } from "./adoApi";
import { buildWorkItemCommentsUrl } from "./fetchWorkItemNotes";

/**
 * Building and parsing the "when was this last commented on?" read.
 *
 * The request carries one page of source comments, newest first, without `$expand=renderedText`.
 * Source text is needed only to skip marker-generated notes; paging continues only when every entry
 * seen so far was excluded, so the common case remains one small request.
 */

/**
 * How many work items one bulk read will ask about.
 *
 * Each id becomes its own fetch inside the page, so this bounds how hard a single click can lean on
 * Azure DevOps. Far above any tracking board's commented-item count, so it is a runaway guard rather
 * than a limit anyone meets.
 */
export const MAX_NOTE_ACTIVITY_ITEMS = 500;

/** The comments requested at once while looking for the newest non-marker note. */
export const NOTE_ACTIVITY_PAGE_SIZE = 200;

/** A runaway guard for a discussion made entirely of marker-generated notes. */
export const MAX_NOTE_ACTIVITY_PAGES = 10;

/** Bounds on content-supplied exclusion prefixes before they enter the credentialed page read. */
export const MAX_NOTE_ACTIVITY_PREFIXES = 20;
export const MAX_NOTE_ACTIVITY_PREFIX_LENGTH = 200;

/**
 * The URL one item's newest comment is read through, or null when `href` is not a project-scoped ADO
 * location.
 */
export function buildNewestNoteUrl(href: string, workItemId: number): string | null {
  return buildWorkItemCommentsUrl(
    href,
    workItemId,
    `?api-version=${ADO_COMMENTS_API_VERSION}&$top=${NOTE_ACTIVITY_PAGE_SIZE}&order=desc`,
  );
}

/**
 * The newest comment's ISO date out of a raw comments-page body, or null when it carries none.
 *
 * Read defensively rather than trusted: the collection is requested newest-first, but a body with no
 * comments, an unexpected shape, or an undated entry must answer "no date" instead of throwing —
 * this runs across every commented item on a board, and one odd response must not lose the rest.
 */
export function parseNewestNoteDate(rawPage: unknown): string | null {
  const comments = (rawPage as { comments?: unknown } | null)?.comments;
  if (!Array.isArray(comments)) {
    return null;
  }
  const created = (comments[0] as { createdDate?: unknown } | undefined)?.createdDate;
  return typeof created === "string" && !Number.isNaN(Date.parse(created)) ? created : null;
}
