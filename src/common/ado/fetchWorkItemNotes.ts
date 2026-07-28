import type { NoteAuthor, WorkItemNote } from "./WorkItemNote";
import {
  ADO_COMMENTS_API_VERSION,
  ADO_COMMENTS_WRITE_API_VERSION,
  ADO_CONNECTION_DATA_API_VERSION,
} from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

/**
 * The largest page Azure DevOps serves from the comments collection. Requesting more is silently
 * capped, so the fetcher pages rather than assuming one call sees everything.
 */
export const NOTES_PAGE_SIZE = 200;

/** The URLs one item's notes are read through. */
export interface WorkItemNotesUrls {
  /**
   * The first page of the item's discussion, newest first. `$expand=renderedText` is what makes
   * ADO resolve `@`-mentions to people's names; without it a mention arrives as a bare GUID.
   */
  commentsUrl: string;
  /**
   * The org's connection data, read for the signed-in identity. Fetched alongside the notes because
   * "which of these may I edit?" is unanswerable without it, and it is served from the same
   * credentialed page context.
   */
  connectionUrl: string;
}

/**
 * The URL of one work item's comments collection with `query` appended, or null when `href` is not a
 * project-scoped ADO location.
 *
 * Shared by every caller that addresses that collection — reading a discussion, posting a note,
 * rewriting one, and the board's newest-comment-date read — so the path is written once and a
 * caller only says what it wants BACK from it.
 */
export function buildWorkItemCommentsUrl(
  href: string,
  workItemId: number,
  query: string,
): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  return `${base}/${project}/_apis/wit/workItems/${workItemId}/comments${query}`;
}

/**
 * Build the URLs one work item's notes are read through, or null when `href` is not a
 * project-scoped ADO location.
 */
export function buildWorkItemNotesUrls(href: string, workItemId: number): WorkItemNotesUrls | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base } = resolved;
  const commentsUrl = buildWorkItemCommentsUrl(
    href,
    workItemId,
    `?api-version=${ADO_COMMENTS_API_VERSION}&$top=${NOTES_PAGE_SIZE}&order=desc&$expand=renderedText`,
  );
  if (commentsUrl === null) {
    return null;
  }
  return {
    commentsUrl,
    connectionUrl: `${base}/_apis/ConnectionData?api-version=${ADO_CONNECTION_DATA_API_VERSION}`,
  };
}

/**
 * Build the URL a new note is posted to, or null when `href` is not a project-scoped ADO location.
 *
 * `format=0` is Markdown. Notes are stored as Markdown so the text an author re-opens for editing is
 * the text they typed; the default (HTML) would hand them back markup they never wrote.
 */
export function buildAddNoteUrl(href: string, workItemId: number): string | null {
  return buildWorkItemCommentsUrl(
    href,
    workItemId,
    `?format=0&api-version=${ADO_COMMENTS_WRITE_API_VERSION}`,
  );
}

/** Build the URL one existing note is rewritten through; null when `href` is not project-scoped. */
export function buildEditNoteUrl(href: string, workItemId: number, noteId: number): string | null {
  return buildWorkItemCommentsUrl(
    href,
    workItemId,
    `/${noteId}?format=0&api-version=${ADO_COMMENTS_WRITE_API_VERSION}`,
  );
}

/**
 * Parse the signed-in identity out of a raw ConnectionData body, or null when it carries none.
 *
 * The sign-in address lives in a typed property bag (`properties.Account.$value`), not as a plain
 * field, so it is read defensively: a tenant that omits it still yields a usable identity from the
 * GUID alone.
 */
export function parseCurrentUser(rawConnection: unknown): NoteAuthor | null {
  const user = asRecord(asRecord(rawConnection)?.authenticatedUser);
  if (user === null) {
    return null;
  }
  const id = nonEmptyString(user.id);
  const uniqueName = nonEmptyString(asRecord(asRecord(user.properties)?.Account)?.$value);
  if (id === null && uniqueName === null) {
    // An identity that can be matched on neither handle cannot authorize an edit; reporting none is
    // what leaves every note read-only rather than offering an edit ADO would reject.
    return null;
  }
  return {
    displayName: nonEmptyString(user.providerDisplayName) ?? uniqueName ?? "",
    id,
    uniqueName,
  };
}

/**
 * Parse the raw comment page bodies into notes, dropping anything older than the Updates window.
 *
 * The window is re-applied here even though the fetcher stops paging at it: a page's last entry can
 * straddle the boundary, and the list must not show a note the next refresh would drop.
 */
export function parseWorkItemNotes(
  rawPages: readonly unknown[],
  workItemId: number,
  sinceIso: string,
): WorkItemNote[] {
  const since = Date.parse(sinceIso);
  const cutoff = Number.isNaN(since) ? Number.NEGATIVE_INFINITY : since;
  const notes: WorkItemNote[] = [];
  for (const page of rawPages) {
    const comments = asRecord(page)?.comments;
    if (!Array.isArray(comments)) {
      continue;
    }
    for (const comment of comments) {
      const note = parseWorkItemNote(comment, workItemId);
      if (note !== null && Date.parse(note.createdDate) >= cutoff) {
        notes.push(note);
      }
    }
  }
  return notes;
}

/** Parse one raw comment, or null when it lacks the id/date a note is identified and ordered by. */
export function parseWorkItemNote(rawComment: unknown, workItemId: number): WorkItemNote | null {
  const comment = asRecord(rawComment);
  if (comment === null || typeof comment.id !== "number") {
    return null;
  }
  const createdDate = typeof comment.createdDate === "string" ? comment.createdDate : "";
  if (createdDate.length === 0 || Number.isNaN(Date.parse(createdDate))) {
    return null;
  }
  const renderedText = comment.renderedText;
  return {
    id: comment.id,
    // ADO echoes the item id on each comment, but the caller already knows which item it asked
    // about; trusting the caller keeps a note filed under the item it was fetched for even when a
    // response omits the field.
    workItemId,
    author: parseNoteAuthor(comment.createdBy),
    createdDate,
    text: typeof comment.text === "string" ? comment.text : "",
    renderedHtml: typeof renderedText === "string" && renderedText.length > 0 ? renderedText : null,
  };
}

/** Parse a raw ADO identity reference into a note author; unknown fields degrade to a blank name. */
function parseNoteAuthor(rawUser: unknown): NoteAuthor {
  const user = asRecord(rawUser);
  return {
    displayName: nonEmptyString(user?.displayName) ?? "",
    id: nonEmptyString(user?.id),
    uniqueName: nonEmptyString(user?.uniqueName),
  };
}

/**
 * A present, non-empty string, or null.
 *
 * Shared by every field read here because ADO reports "this identity has no address" as an EMPTY
 * string rather than by omitting the field — and an empty handle compared against another empty
 * handle would make two anonymous identities look like the same person.
 */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Narrow an unknown JSON value to an indexable object, or null when it is not one. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
