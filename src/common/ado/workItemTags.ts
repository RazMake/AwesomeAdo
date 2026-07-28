/**
 * Reading and rewriting a work item's `System.Tags`.
 *
 * Azure DevOps stores every tag on an item in ONE string field, separated by semicolons, and it
 * compares tags case-insensitively while preserving whatever casing was first used. Both facts are
 * easy to get wrong in isolation — a naive `split(";")` leaves the spaces ADO pads with, and a
 * case-sensitive membership test re-adds a tag the item already wears under different casing — so
 * every reader and writer of that field goes through here.
 *
 * Pure and chrome-free: the tree parser, the board's filters and the tagging commands all share this
 * one interpretation of the field, which is what keeps "does this item carry the tag?" answering the
 * same in all three.
 */

/** How Azure DevOps joins the tags it stores in `System.Tags`. */
const TAG_SEPARATOR = "; ";

/** Split ADO's `System.Tags` string into its tags, dropping the padding and any empty entries. */
export function parseWorkItemTags(raw: unknown): string[] {
  if (typeof raw !== "string") {
    return [];
  }
  return raw
    .split(";")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** Join tags back into the single string ADO stores them as. */
export function formatWorkItemTags(tags: readonly string[]): string {
  return tags.join(TAG_SEPARATOR);
}

/**
 * Does the item wear this tag? Compared case-insensitively because ADO treats `Blocked` and
 * `blocked` as the same tag — a case-sensitive test would report "not tagged" for an item the server
 * would then refuse to tag twice.
 */
export function hasWorkItemTag(tags: readonly string[], tag: string): boolean {
  const wanted = tag.trim().toLowerCase();
  return wanted.length > 0 && tags.some((existing) => existing.trim().toLowerCase() === wanted);
}

/**
 * The item's tags with `tag` added, or the same list when it is already there. The new tag goes last
 * so the tags the team already had keep the order (and casing) they were stored in.
 */
export function withWorkItemTag(tags: readonly string[], tag: string): string[] {
  const added = tag.trim();
  if (added.length === 0 || hasWorkItemTag(tags, added)) {
    return [...tags];
  }
  return [...tags, added];
}

/** The item's tags with every case-insensitive match for `tag` removed. */
export function withoutWorkItemTag(tags: readonly string[], tag: string): string[] {
  const removed = tag.trim().toLowerCase();
  return tags.filter((existing) => existing.trim().toLowerCase() !== removed);
}
