/**
 * The normalized model for a work item "note" — one entry in an Azure DevOps work item's Discussion.
 *
 * Kept independent of the REST shape (like `TrackedWorkItem`) so a view never parses raw ADO JSON
 * and a test fake can mint notes directly.
 */

import { isoEpoch } from "../datetime/isoEpoch";

/** Whoever wrote or is reading a note: enough to show them and to recognize them again. */
export interface NoteAuthor {
  /** The person's full name, as ADO renders it. */
  displayName: string;
  /** The ADO identity GUID; `null` when the directory returned none. */
  id: string | null;
  /** The sign-in address; `null` when the directory returned none. */
  uniqueName: string | null;
}

/** One discussion comment on a work item. */
export interface WorkItemNote {
  /** The comment id, unique within its work item — the handle an edit is addressed to. */
  id: number;
  /** The work item the note is filed under. */
  workItemId: number;
  author: NoteAuthor;
  /** ISO 8601 timestamp of when the note was first posted. */
  createdDate: string;
  /**
   * The note's SOURCE text (Markdown or ADO rich-text HTML), which is what an edit re-opens. Kept
   * alongside `renderedHtml` because rendering is lossy: re-posting the rendered form would rewrite
   * the author's Markdown into HTML the first time anyone corrected a typo.
   */
  text: string;
  /**
   * ADO's own rendering of `text` as HTML, when it supplied one. Preferred for display because it is
   * where ADO resolves an `@`-mention to the person's name — the raw text only carries their GUID.
   * `null` when the response carried no rendering, in which case `text` is rendered directly.
   */
  renderedHtml: string | null;
}

/** How many distinct days of notes an expanded list shows. */
const VISIBLE_NOTE_DAYS = 2;

/**
 * The longest note this extension will author.
 *
 * Azure DevOps caps a comment far above anything a person types into an inline composer, so this is
 * not the server's limit — it is the bound the composer stops at and the message contract refuses
 * past, so a runaway value can never be assembled into a request body.
 */
export const MAX_NOTE_LENGTH = 10000;

/** Milliseconds in a week, the unit the Updates window is configured in. */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * The ISO timestamp marking the start of the Updates window: `weeks` before `now`.
 *
 * Computed here rather than at each call site because both ends depend on it — the loader asks ADO
 * only for notes newer than this, and the list drops anything older that a cached response still
 * carries — and a window that differed between them would show notes the fetch never refreshed.
 */
export function noteWindowStart(now: Date, weeks: number): string {
  return new Date(now.getTime() - weeks * MS_PER_WEEK).toISOString();
}

/** Newest first, without mutating the caller's array. A note with an unparseable date sorts last. */
export function sortNotesNewestFirst(notes: readonly WorkItemNote[]): WorkItemNote[] {
  return [...notes].sort((left, right) => epochOf(right.createdDate) - epochOf(left.createdDate));
}

/**
 * The notes an expanded list shows: everything posted on the two most recent days that HAVE notes.
 *
 * Two days, not two notes: a burst of updates on one afternoon is a single conversation, and cutting
 * it at an arbitrary count would show half an exchange. Days are counted only where activity exists,
 * so a quiet week still shows the last two days anyone actually wrote something.
 *
 * The day is taken in the READER's local zone, because "the last two days" is a claim about their
 * calendar, not about UTC's.
 */
export function selectRecentNoteDays(notes: readonly WorkItemNote[]): WorkItemNote[] {
  const sorted = sortNotesNewestFirst(notes);
  const days: string[] = [];
  return sorted.filter((note) => {
    const day = localDayKey(note.createdDate);
    if (day === null) {
      // An unparseable date cannot be attributed to a day, so it can never be one of the two most
      // recent ones — dropping it is what keeps the list a truthful "last two days".
      return false;
    }
    if (!days.includes(day)) {
      if (days.length >= VISIBLE_NOTE_DAYS) {
        return false;
      }
      days.push(day);
    }
    return true;
  });
}

/** Whether `note` was written by `reader`, matched on identity GUID first and sign-in address second. */
export function isOwnNote(note: WorkItemNote, reader: NoteAuthor | null): boolean {
  if (reader === null) {
    return false;
  }
  // The GUID is the identity ADO itself authorizes an edit against, so it decides whenever both
  // sides have one. The address is the fallback for directories that return no id; display names are
  // never compared, because two people routinely share one.
  if (reader.id !== null && note.author.id !== null) {
    return reader.id.toLowerCase() === note.author.id.toLowerCase();
  }
  if (reader.uniqueName !== null && note.author.uniqueName !== null) {
    return reader.uniqueName.toLowerCase() === note.author.uniqueName.toLowerCase();
  }
  return false;
}

/** An ISO timestamp as epoch milliseconds; unparseable input sorts last (oldest). */
function epochOf(iso: string): number {
  return isoEpoch(iso) ?? Number.NEGATIVE_INFINITY;
}

/** A `YYYY-M-D` key in the reader's local zone, or null when the timestamp will not parse. */
function localDayKey(iso: string): string | null {
  const parsed = isoEpoch(iso);
  if (parsed === null) {
    return null;
  }
  const date = new Date(parsed);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
