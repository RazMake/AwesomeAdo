/**
 * The request to move a work item to a new position — and, when it changed, under a new parent.
 *
 * Position is expressed as the two items the moved one lands BETWEEN rather than as a rank value,
 * because Azure DevOps owns the rank arithmetic: it picks a value between the neighbours (or
 * renumbers the level when there is no gap left) and hands the result back. Naming neighbours also
 * survives a stale board — two people dragging at once still each land where they aimed, whereas two
 * independently-computed ranks would collide.
 */
export interface WorkItemReorderRequest {
  /** The work item being moved. */
  id: number;
  /** The item's last-known `System.Rev`, used as the concurrency guard on the re-parent patch. */
  rev: number;
  /**
   * The parent the item must end up under; `0` when it should sit at the top level. Always the
   * INTENDED parent, even when it is the current one — ADO ranks siblings within a parent, so the
   * order call needs it regardless of whether the link itself changes.
   */
  parentId: number;
  /** The parent the item is under today, so an unchanged parent skips the link patch entirely. */
  currentParentId: number;
  /** The sibling the item lands after; `0` places it first in the level. */
  previousId: number;
  /** The sibling the item lands before; `0` places it last in the level. */
  nextId: number;
  /**
   * The destination level in its POST-drop order — every sibling, including rows a filter hides.
   *
   * Needed because Azure DevOps refuses to rank items that hold no backlog position, and the rank
   * written by hand in that case is derived from the level the user ended up with.
   */
  siblingIds: readonly number[];
  /** The destination parent's default child type, applied atomically with a changed parent link. */
  type?: string;
  /** The destination column's primary ADO state, applied before the item is ranked there. */
  stateName?: string;
  /** The state the card showed when the move began, allowing one conflict-safe rev rebase. */
  stateBaseName?: string;
  /** The team whose backlog order is being changed (ADO ranks per team). */
  team: string;
}

/** The outcome of a reorder: success plus what changed, or a failure with a short description. */
export interface WorkItemReorderResult {
  /** Whether the move succeeded; false means an error was logged. */
  ok: boolean;
  /**
   * The item's new backlog rank, when ADO reported one. Lets the caller refresh its in-memory copy
   * so a later re-sort keeps the item where it was dropped instead of snapping back to its old rank.
   */
  order?: number;
  /**
   * The item's `System.Rev` after the move, re-read once the ranking landed.
   *
   * Ranking bumps the revision — the rank IS a field on the item — but the order endpoint answers
   * with positions only, so this is read back rather than reported by ADO. The caller folds it onto
   * its copy or the item's next field write is refused as a conflict with the move it just made.
   */
  rev?: number;
  /**
   * Whether the hierarchy link was changed, reported even when the move then failed to rank the
   * item. A caller that leaves its tree untouched after a failed move would otherwise keep showing
   * the old parent and resend a request Azure DevOps has already applied.
   */
  reparented?: boolean;
  /** Whether the optional state change landed, even when the later rank operation failed. */
  stateChanged?: boolean;
  /**
   * Every rank written directly, when Azure DevOps refused to rank the item itself. Placing an item
   * can renumber its whole level, so this names each item whose rank changed — not just the moved
   * one — and the caller refreshes all of them or its next re-sort scrambles the level. Each entry
   * also carries that item's new `System.Rev` where the write reported one.
   */
  ranks?: readonly { id: number; rank: number; rev?: number }[];
  /** A short error description when ok is false. */
  error?: string;
}

/**
 * Moves a work item within (or between) parents in Azure DevOps.
 *
 * Kept abstract so a view depends on this interface rather than on chrome or on ADO's wire format
 * (Dependency Inversion): the real implementation messages the background worker, which runs the
 * credentialed calls in the ADO tab's MAIN world, and a test fake returns canned results.
 *
 * Separate from `IWorkItemFieldWriter` on purpose (Interface Segregation): a re-parent is a change to
 * the item's LINKS and its rank is owned by a team-scoped backlog endpoint — neither is a field
 * patch, and a consumer that only edits fields must not be handed the ability to restructure a tree.
 */
export interface IWorkItemReorderWriter {
  reorder(request: WorkItemReorderRequest): Promise<WorkItemReorderResult>;
}
