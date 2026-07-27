/**
 * The content→background message contracts for a work item's discussion notes.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * fetch the credentialed ADO REST API itself (CORS-blocked, and a same-origin fetch from the
 * extension page would drop ADO's session cookies). Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side asks it to do so and
 * hands back the raw bodies. Keeping the shapes here means both ends agree on one contract instead
 * of drifting apart.
 *
 * Read and write live in one file because they are one conversation about one collection; the
 * background worker builds every URL from the SENDER's own trusted tab URL, so a content script can
 * name WHICH item's discussion it means but never WHERE the request goes.
 */

import { MAX_NOTE_LENGTH } from "../ado/WorkItemNote";

export const LOAD_WORK_ITEM_NOTES_MESSAGE = "awesomeado:load-work-item-notes";
export const WRITE_WORK_ITEM_NOTE_MESSAGE = "awesomeado:write-work-item-note";

export interface LoadWorkItemNotesMessage {
  type: typeof LOAD_WORK_ITEM_NOTES_MESSAGE;
  workItemId: number;
  /** ISO 8601 start of the Updates window; the fetcher stops paging once it reads past it. */
  sinceIso: string;
}

/** The raw bodies one notes read produced: the comment pages, plus who is signed in. */
export interface RawWorkItemNotes {
  /** Each comments page body, newest first. Empty when the item has no notes in the window. */
  pages: unknown[];
  /** The org's ConnectionData body, read for the signed-in identity; null when it could not be read. */
  connection: unknown;
  /** The HTTP status of the comments read, or 0 when the request never completed at all. */
  status: number;
  /**
   * `none` when the discussion was read (an item with no notes still counts); `http` when ADO
   * rejected the request; `sign-in` when a 200 carried something other than JSON (ADO answers an
   * expired session with its HTML sign-in page); `network` when the request never completed.
   *
   * Classified rather than collapsed to "no data" because an empty discussion and a lost session
   * would otherwise be the same empty list on screen and the same silence in the log.
   */
  failure: "none" | "http" | "sign-in" | "network";
}

export interface LoadWorkItemNotesResponse {
  raw: RawWorkItemNotes | null;
  /** A short description of why the read failed; absent on success. */
  error?: string;
}

export interface WriteWorkItemNoteMessage {
  type: typeof WRITE_WORK_ITEM_NOTE_MESSAGE;
  workItemId: number;
  /** The comment being rewritten, or `null` to post a new one. */
  noteId: number | null;
  /** The note's Markdown source. */
  text: string;
}

export interface WriteWorkItemNoteResponse {
  ok: boolean;
  /** The saved comment body, so the caller can show exactly what ADO stored. */
  raw?: unknown;
  error?: string;
}

/** A work item id: a positive integer, since it is interpolated into the request URL. */
function isWorkItemId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Whether `message` CLAIMS to be of `type` — the cheap check a worker listener uses to decide the
 * message is its business at all.
 *
 * Deliberately separate from full validation: a listener that filters with the strict guard silently
 * drops a malformed message of its OWN kind, which the sender then sees as "no response from
 * background" — the same symptom as a worker with no handler. Claiming first lets the listener own
 * the message and answer with the reason it was rejected.
 */
export function claimsMessageType(message: unknown, type: string): boolean {
  return (
    typeof message === "object" && message !== null && (message as { type?: unknown }).type === type
  );
}

/** An ISO 8601 timestamp the background worker can compare page entries against. */
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Why `value` is not a usable notes read request, or null when it is one.
 *
 * A *reason* rather than a bare boolean, for exactly the reason the reorder contract carries one:
 * the worker's listeners are type-guarded, so a message that fails validation is simply IGNORED —
 * and an ignored message reaches the content side as the uninformative "no response from
 * background", indistinguishable from a worker that has no handler at all. Naming the offending
 * field turns that dead end into a diagnosis.
 */
export function loadNotesMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "message is not an object";
  }
  const candidate = value as Partial<LoadWorkItemNotesMessage>;
  if (candidate.type !== LOAD_WORK_ITEM_NOTES_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${LOAD_WORK_ITEM_NOTES_MESSAGE}"`;
  }
  if (!isWorkItemId(candidate.workItemId)) {
    return `workItemId is ${String(candidate.workItemId)}, expected a positive integer`;
  }
  if (!isTimestamp(candidate.sinceIso)) {
    return `sinceIso is "${String(candidate.sinceIso)}", expected an ISO 8601 timestamp`;
  }
  return null;
}

/** Why `value` is not a usable note write request, or null when it is one. See above. */
export function writeNoteMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "message is not an object";
  }
  const candidate = value as Partial<WriteWorkItemNoteMessage>;
  if (candidate.type !== WRITE_WORK_ITEM_NOTE_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${WRITE_WORK_ITEM_NOTE_MESSAGE}"`;
  }
  if (!isWorkItemId(candidate.workItemId)) {
    return `workItemId is ${String(candidate.workItemId)}, expected a positive integer`;
  }
  if (candidate.noteId !== null && !isWorkItemId(candidate.noteId)) {
    return `noteId is ${String(candidate.noteId)}, expected null or a positive integer`;
  }
  if (typeof candidate.text !== "string" || candidate.text.trim().length === 0) {
    return "text is missing or blank";
  }
  // The LENGTH, never the text: this reason is logged, and a note routinely names people and
  // customers (AGENTS.md §9).
  if (candidate.text.length > MAX_NOTE_LENGTH) {
    return `text is ${candidate.text.length} characters, longer than the ${MAX_NOTE_LENGTH} allowed`;
  }
  return null;
}

export function isLoadWorkItemNotesMessage(value: unknown): value is LoadWorkItemNotesMessage {
  return loadNotesMessageProblem(value) === null;
}

export function isWriteWorkItemNoteMessage(value: unknown): value is WriteWorkItemNoteMessage {
  return writeNoteMessageProblem(value) === null;
}
