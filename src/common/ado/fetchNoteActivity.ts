import { ADO_COMMENTS_API_VERSION } from "./adoApi";
import { buildWorkItemCommentsUrl } from "./fetchWorkItemNotes";

/**
 * Building and parsing the "when was this last commented on?" read.
 *
 * The request is deliberately the smallest one Azure DevOps will answer: the newest comment only
 * (`$top=1&order=desc`), with no `$expand=renderedText`. The board is asking about a TIMESTAMP, and
 * the notes panel's request — up to 200 comments with ADO's HTML rendering of each — costs orders of
 * magnitude more bytes to carry the same one date.
 */

/**
 * How many work items one bulk read will ask about.
 *
 * Each id becomes its own fetch inside the page, so this bounds how hard a single click can lean on
 * Azure DevOps. Far above any tracking board's commented-item count, so it is a runaway guard rather
 * than a limit anyone meets.
 */
export const MAX_NOTE_ACTIVITY_ITEMS = 500;

/**
 * The URL one item's newest comment is read through, or null when `href` is not a project-scoped ADO
 * location.
 */
export function buildNewestNoteUrl(href: string, workItemId: number): string | null {
  return buildWorkItemCommentsUrl(
    href,
    workItemId,
    `?api-version=${ADO_COMMENTS_API_VERSION}&$top=1&order=desc`,
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
