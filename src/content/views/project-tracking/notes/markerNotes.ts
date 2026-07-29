import {
  WORK_ITEM_MARKERS,
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

/** The note's source with the marker prefix it opens with turned into an inline code span. */
export function withMarkerCommentAsCode(text: string, prefixes: readonly string[]): string {
  const prefix = prefixes.find((candidate) => text.startsWith(candidate));
  return prefix === undefined ? text : `\`${prefix}\`${text.slice(prefix.length)}`;
}
