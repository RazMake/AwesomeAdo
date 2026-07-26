import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";

import type { MovePlacement } from "./movePlacement";

/**
 * Re-home a moved item inside the board's in-memory tree so the next render shows it where Azure
 * DevOps just put it, without re-reading the whole query.
 *
 * Only the item's PARENTAGE and its rank are changed; its position in the parent's `children` array
 * is irrelevant, because every level is re-sorted by the active policy on each pass. Returns false
 * when the item or its destination is not in this tree, which tells the caller its model is stale and
 * a repaint would be a lie.
 */
export function applyMoveToTree(
  root: TrackedWorkItem,
  move: MovePlacement & { id: number },
  order: number | null,
): boolean {
  const moved = findItem(root, move.id);
  const oldParent = findParentOf(root, move.id);
  const newParent = findItem(root, move.parentId);
  if (moved === null || oldParent === null || newParent === null) {
    return false;
  }

  oldParent.children = oldParent.children.filter((child) => child.id !== move.id);
  if (!newParent.children.some((child) => child.id === move.id)) {
    newParent.children.push(moved);
  }
  moved.importance = order ?? estimateRank(newParent.children, move, moved.importance);
  return true;
}

/**
 * A stand-in rank for the rare case where ADO accepted the move but reported no new order value.
 *
 * Placing the item midway between the ranks of the neighbours it was dropped between reproduces
 * where the user aimed until the next full load replaces it with ADO's real value. Falling back to
 * the item's existing rank (rather than to zero) keeps a failure to estimate from catapulting it to
 * the top of the level.
 */
function estimateRank(
  siblings: readonly TrackedWorkItem[],
  placement: MovePlacement,
  fallback: number,
): number {
  const previous = rankOf(siblings, placement.previousId);
  const next = rankOf(siblings, placement.nextId);
  if (previous !== null && next !== null) {
    return (previous + next) / 2;
  }
  if (previous !== null) {
    return previous + 1;
  }
  if (next !== null) {
    return next - 1;
  }
  return fallback;
}

/** The rank of the sibling with `id`, or null for ADO's `0` sentinel or an id not in the level. */
function rankOf(siblings: readonly TrackedWorkItem[], id: number): number | null {
  if (id === 0) {
    return null;
  }
  return siblings.find((sibling) => sibling.id === id)?.importance ?? null;
}

/** The item with `id` anywhere at or below `root`, or null when this tree does not hold it. */
function findItem(root: TrackedWorkItem, id: number): TrackedWorkItem | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findItem(child, id);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The item that currently holds `id` among its children, or null when nothing in this tree does. */
function findParentOf(root: TrackedWorkItem, id: number): TrackedWorkItem | null {
  if (root.children.some((child) => child.id === id)) {
    return root;
  }
  for (const child of root.children) {
    const found = findParentOf(child, id);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
