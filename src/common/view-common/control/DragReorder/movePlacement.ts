/** A persisted sibling position expressed by its neighbours and parent. */
export interface MovePlacement {
  parentId: number;
  previousId: number;
  nextId: number;
}

/** Which side of the row under the pointer receives the insertion. */
export type DropSide = "before" | "after";

/** A resolved destination plus its complete post-drop sibling order. */
export interface ResolvedMove extends MovePlacement {
  siblingIds: number[];
}

/** The placement `id` already occupies, or null when it is absent from the level. */
export function placementOf(
  id: number,
  siblingIds: readonly number[],
  parentId: number,
): MovePlacement | null {
  const index = siblingIds.indexOf(id);
  if (index < 0) return null;
  return {
    parentId,
    previousId: siblingIds[index - 1] ?? 0,
    nextId: siblingIds[index + 1] ?? 0,
  };
}

/** Resolve a neighbour-based destination, returning null for stale targets and no-op drops. */
export function resolveMove(options: {
  movedId: number;
  currentParentId: number;
  currentSiblingIds: readonly number[];
  targetId: number;
  side: DropSide;
  targetParentId: number;
  targetSiblingIds: readonly number[];
}): ResolvedMove | null {
  const { movedId, targetId, side, targetParentId } = options;
  if (movedId === targetId) return null;
  const remaining = options.targetSiblingIds.filter((siblingId) => siblingId !== movedId);
  const targetIndex = remaining.indexOf(targetId);
  if (targetIndex < 0) return null;
  const insertAt = side === "before" ? targetIndex : targetIndex + 1;
  const siblingIds = [...remaining];
  siblingIds.splice(insertAt, 0, movedId);
  const placement: ResolvedMove = {
    parentId: targetParentId,
    previousId: remaining[insertAt - 1] ?? 0,
    nextId: remaining[insertAt] ?? 0,
    siblingIds,
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
