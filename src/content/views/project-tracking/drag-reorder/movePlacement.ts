/**
 * Where a dragged item lands, expressed the way Azure DevOps takes it: the two siblings it sits
 * BETWEEN, plus the parent it belongs to.
 *
 * Deliberately not a rank number. ADO owns the rank arithmetic (it picks a value between the
 * neighbours, or renumbers the level when no gap is left), and naming neighbours is also what makes
 * a move survive a stale board — two people dragging at once each still land where they aimed,
 * whereas two independently-computed ranks would collide.
 */
export interface MovePlacement {
  /** The parent the item ends up under; `0` for the top level (ADO's own sentinel). */
  parentId: number;
  /** The sibling immediately above the item; `0` when it lands first in the level. */
  previousId: number;
  /** The sibling immediately below the item; `0` when it lands last in the level. */
  nextId: number;
}

/** Which side of the row under the pointer the item would be inserted on. */
export type DropSide = "before" | "after";

/**
 * The placement `id` already occupies within `siblingIds`.
 *
 * Used to recognize a drop that changes nothing (the item was dragged back onto its own slot) so it
 * never becomes an ADO write. Returns null when `id` is not in the list, which is the caller's cue
 * that its view of the tree is stale and the move should not be attempted.
 */
export function placementOf(
  id: number,
  siblingIds: readonly number[],
  parentId: number,
): MovePlacement | null {
  const index = siblingIds.indexOf(id);
  if (index < 0) {
    return null;
  }
  return {
    parentId,
    previousId: siblingIds[index - 1] ?? 0,
    nextId: siblingIds[index + 1] ?? 0,
  };
}

/**
 * Resolve where `movedId` lands when dropped on `side` of `targetId`.
 *
 * `siblingIds` must be the target level's FULL sibling list in board order — every sibling, not just
 * the ones the active sprint/tag filters leave on screen. Ranking against the visible subset would
 * place the item relative to whichever rows happened to be shown, so clearing the filter afterwards
 * would reveal it somewhere the user never dropped it. The moved item is removed from the list
 * first, because it is vacating its old slot as part of the same move.
 *
 * Returns null when the drop cannot be resolved (an unknown target) or is a no-op — the item was
 * dropped back exactly where it already was, which must not cost an ADO round-trip.
 */
export function resolveMove(options: {
  movedId: number;
  /** The moved item's current parent, so a drop onto its own slot is recognized as a no-op. */
  currentParentId: number;
  /** The moved item's current level, in board order (used only for the no-op comparison). */
  currentSiblingIds: readonly number[];
  targetId: number;
  side: DropSide;
  targetParentId: number;
  targetSiblingIds: readonly number[];
}): MovePlacement | null {
  const { movedId, targetId, side, targetParentId } = options;
  if (movedId === targetId) {
    return null;
  }
  const remaining = options.targetSiblingIds.filter((siblingId) => siblingId !== movedId);
  const targetIndex = remaining.indexOf(targetId);
  if (targetIndex < 0) {
    return null;
  }
  const insertAt = side === "before" ? targetIndex : targetIndex + 1;
  const placement: MovePlacement = {
    parentId: targetParentId,
    previousId: remaining[insertAt - 1] ?? 0,
    nextId: remaining[insertAt] ?? 0,
  };

  const current = placementOf(movedId, options.currentSiblingIds, options.currentParentId);
  return current !== null && isSamePlacement(current, placement) ? null : placement;
}

function isSamePlacement(left: MovePlacement, right: MovePlacement): boolean {
  return (
    left.parentId === right.parentId &&
    left.previousId === right.previousId &&
    left.nextId === right.nextId
  );
}
