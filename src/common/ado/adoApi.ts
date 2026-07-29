/**
 * The Azure DevOps REST API version every request in this extension targets.
 *
 * Single source of truth on purpose: the URL builders live in several modules (tree, metadata,
 * iterations, Feature Crew) and a version that drifts between them produces responses with
 * different shapes for the same data, which surfaces as a parse failure far from the cause.
 */
export const ADO_API_VERSION = "7.1";

/**
 * The API version the work-item discussion (comments) endpoints are read through.
 *
 * Deliberately NOT `ADO_API_VERSION`: the comments collection is still a preview API, and the
 * released `7.1` version does not serve it at all — asking for it answers 404, which surfaces as
 * "this item has no notes" rather than as a version problem. Pinned beside the released version so
 * the exception is visible instead of buried in a URL builder.
 */
export const ADO_COMMENTS_API_VERSION = "7.1-preview.4";

/**
 * The API version the discussion endpoints are WRITTEN through.
 *
 * Higher than the read version on purpose: only `7.2-preview.4` honours the `format` parameter, and
 * without it Azure DevOps stores every posted note as HTML. Notes are authored (and re-opened for
 * editing) as Markdown here, so a note written through the read version would come back as escaped
 * HTML the moment someone edited it.
 */
export const ADO_COMMENTS_WRITE_API_VERSION = "7.2-preview.4";

/**
 * The API version the org's `ConnectionData` (the signed-in identity) is read through.
 *
 * Deliberately NOT `ADO_API_VERSION`: `ConnectionData` is served ONLY under a preview version.
 * Asking for a released one answers `400 VssInvalidPreviewVersionException` ("use a preview version
 * for such requests") — verified against a live org for 5.0, 6.0, 7.0 and 7.1 alike. That 400 used
 * to reach `parseCurrentUser` as an error envelope with no `authenticatedUser`, which reads exactly
 * like "nobody is signed in" and quietly made EVERY note read-only. Pinned beside the released
 * version so the exception is visible instead of buried in a URL builder.
 */
export const ADO_CONNECTION_DATA_API_VERSION = "7.1-preview.1";

/**
 * The reference name of the Azure DevOps assignee field. Named once because it is both requested
 * with the tree and patched back when a view reassigns an item; a literal repeated at each end is
 * exactly the kind of drift that shows up as a silently ignored write.
 */
export const ASSIGNED_TO_FIELD = "System.AssignedTo";

/**
 * The reference name of Azure DevOps' numeric Priority field.
 *
 * Priority is part of the Common field namespace, not System. Keeping the read and write on this
 * one constant prevents an unknown field from rejecting the whole work-items batch while the chip
 * later writes somewhere else.
 */
export const PRIORITY_FIELD = "Microsoft.VSTS.Common.Priority";

/**
 * The reference name of Azure DevOps' manual backlog rank (a LOWER number is more important).
 *
 * Named here rather than inside the tree loader because both ends of "order by importance" now use
 * it: the tree READS it to sort a level, and the drag-reorder fallback WRITES it when ADO's own
 * backlog-order endpoint refuses to rank an item. Two literals would let the board sort on one field
 * while a move wrote another, which reads as a drop that silently snapped back.
 */
export const IMPORTANCE_FIELD = "Microsoft.VSTS.Common.StackRank";

/**
 * The string an identity field is patched with for a picked person.
 *
 * Azure DevOps resolves an identity field from a unique name (the sign-in address), so that is used
 * whenever it is known: two people can share a display name, and ADO rejects a patch it cannot
 * resolve to exactly one identity. The display name is the fallback only because some directories
 * return no address at all, in which case it is the only handle available.
 */
export function identityFieldValue(user: {
  displayName: string;
  uniqueName: string | null;
}): string {
  return user.uniqueName !== null && user.uniqueName.length > 0
    ? user.uniqueName
    : user.displayName;
}
