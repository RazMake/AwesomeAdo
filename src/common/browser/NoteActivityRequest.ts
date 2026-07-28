/**
 * The content→background message contract for the bulk "when was each of these last commented on?"
 * read.
 *
 * Same reason the notes contract exists: a content script cannot reach the credentialed ADO REST API
 * itself, so it asks the worker to run the MAIN-world fetch. The message carries only WHICH items
 * are being asked about — never a URL — because the worker builds every URL from the SENDER's own
 * trusted tab location.
 */

import { MAX_NOTE_ACTIVITY_ITEMS } from "../ado/fetchNoteActivity";

export const READ_NOTE_ACTIVITY_MESSAGE = "awesomeado:read-note-activity";

export interface ReadNoteActivityMessage {
  type: typeof READ_NOTE_ACTIVITY_MESSAGE;
  workItemIds: number[];
}

/** What one bulk read produced, straight from the page. */
export interface RawNoteActivity {
  /** One entry per item that was read; `newestNoteDate` is null when the item has no comments. */
  newest: { workItemId: number; newestNoteDate: string | null }[];
  /**
   * Items whose read failed, kept apart from `newest` so an unread item can never be mistaken for an
   * item nobody has commented on.
   */
  failedIds: number[];
  /**
   * How the FIRST failure ended: `http` when ADO rejected the request, `sign-in` when a 200 carried
   * something other than JSON (ADO answers an expired session with its HTML sign-in page), `network`
   * when a request never completed, `none` when everything was read.
   *
   * Classified rather than collapsed, for the same reason the notes read classifies: a lost session
   * and a quiet board would otherwise leave the same silence in the log (AGENTS.md §9).
   */
  failure: "none" | "http" | "sign-in" | "network";
  /** The HTTP status of the first failure, or 0 when there was none (or it never completed). */
  status: number;
}

export interface ReadNoteActivityResponse {
  raw: RawNoteActivity | null;
  /** A short description of why the read failed; absent on success. */
  error?: string;
}

/**
 * Why `value` is not a usable note-activity request, or null when it is one.
 *
 * A *reason* rather than a bare boolean, for the same reason every other contract here carries one:
 * a message the worker silently ignores reaches the content side as the uninformative "no response
 * from background", indistinguishable from a worker with no handler at all.
 */
export function readNoteActivityMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "message is not an object";
  }
  const candidate = value as Partial<ReadNoteActivityMessage>;
  if (candidate.type !== READ_NOTE_ACTIVITY_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${READ_NOTE_ACTIVITY_MESSAGE}"`;
  }
  const ids = candidate.workItemIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    return "workItemIds is not a non-empty array";
  }
  if (ids.length > MAX_NOTE_ACTIVITY_ITEMS) {
    return `workItemIds carries ${ids.length} ids, more than the ${MAX_NOTE_ACTIVITY_ITEMS} ceiling`;
  }
  if (!ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
    // Every id is interpolated into a request URL, so anything but a positive integer is refused
    // before a URL can be built from it.
    return "workItemIds contains an entry that is not a positive integer";
  }
  return null;
}
