/** Expandable row ids grouped by hierarchy depth, shallowest first; omit filtered-out rows. */
export type ExpandableLevels = readonly (readonly number[])[];

/** Change one tree level and return its zero-based depth, or null when already at the boundary. */
export function stepTreeExpansion(
  expandedIds: Set<number>,
  levels: ExpandableLevels,
  expanded: boolean,
): number | null {
  const orderedLevels = expanded ? levels.entries() : [...levels.entries()].reverse();
  for (const [depth, level] of orderedLevels) {
    if (!level.some((id) => expandedIds.has(id) !== expanded)) continue;
    for (const id of level) {
      if (expanded) expandedIds.add(id);
      else expandedIds.delete(id);
    }
    return depth;
  }
  return null;
}
