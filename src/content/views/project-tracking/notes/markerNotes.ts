import {
  WORK_ITEM_MARKERS,
  type WorkItemMarker,
  type WorkItemMarkerTags,
} from "../../../../common/settings/ExtensionSettings";

/** The configured, non-empty comment prefixes that identify marker-generated notes. */
export function markerCommentPrefixes(markerTags: WorkItemMarkerTags): string[] {
  return [
    ...new Set(
      WORK_ITEM_MARKERS.map(({ key }) => markerTags[key].commentTag).filter(
        (prefix) => prefix.length > 0,
      ),
    ),
  ];
}

/** Whether a note begins with one of the team's configured marker comment prefixes. */
export function startsWithMarkerComment(text: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => text.startsWith(prefix));
}

/** The marker a note is attributed to by the token it opens with, and that token. */
export interface MarkerComment {
  marker: WorkItemMarker;
  prefix: string;
}

/**
 * Which marker a note belongs to, read from the token it opens with.
 *
 * Resolved in the markers' own presentation order because a value imported or synced from an older
 * build may still hold two markers with the same token even though the options UI now rejects that
 * on entry; a note can only be attributed to one of them, so first match wins, and every surface at
 * least attributes the note to the same condition.
 */
export function markerCommentOf(
  text: string,
  markerTags: WorkItemMarkerTags,
): MarkerComment | null {
  for (const { key } of WORK_ITEM_MARKERS) {
    const prefix = markerTags[key].commentTag;
    if (prefix.length > 0 && text.startsWith(prefix)) {
      return { marker: key, prefix };
    }
  }
  return null;
}

/**
 * A marker note as its author wrote it: the bookkeeping token taken off the front.
 *
 * The token is how the extension recognizes the note, not something the reader chose to say, so it
 * is never part of what a note reads as — or of what an author is handed back to correct.
 */
export function withoutMarkerComment(text: string, prefix: string | undefined): string {
  return prefix === undefined || !text.startsWith(prefix)
    ? text
    : text.slice(prefix.length).trimStart();
}

/**
 * Put the marker token back on a corrected note.
 *
 * Without this an edit would silently un-mark the note — the pill that opened it would stop finding
 * it, and an accepted Interrupt would read as unaccepted — purely because someone fixed a typo.
 */
export function withMarkerComment(text: string, prefix: string | undefined): string {
  return prefix === undefined || prefix.length === 0 ? text : `${prefix} ${text}`;
}
