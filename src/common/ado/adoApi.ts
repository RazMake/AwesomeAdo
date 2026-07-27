/**
 * The Azure DevOps REST API version every request in this extension targets.
 *
 * Single source of truth on purpose: the URL builders live in several modules (tree, metadata,
 * iterations, Feature Crew) and a version that drifts between them produces responses with
 * different shapes for the same data, which surfaces as a parse failure far from the cause.
 */
export const ADO_API_VERSION = "7.1";

/**
 * The reference name of the Azure DevOps assignee field. Named once because it is both requested
 * with the tree and patched back when a view reassigns an item; a literal repeated at each end is
 * exactly the kind of drift that shows up as a silently ignored write.
 */
export const ASSIGNED_TO_FIELD = "System.AssignedTo";

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
