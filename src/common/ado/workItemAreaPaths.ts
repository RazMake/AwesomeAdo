import type { TrackedWorkItem } from "./TrackedWorkItem";

/**
 * The distinct full area paths the given items sit in, alphabetically.
 *
 * The vocabulary an area-path filter offers: only paths some item actually holds, so no choice can
 * narrow a board to nothing.
 */
export function representedAreaPaths(items: Iterable<TrackedWorkItem>): string[] {
  const paths = new Set<string>();
  for (const { areaPath } of items) {
    if (areaPath !== null && areaPath.trim().length > 0) paths.add(areaPath);
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

/**
 * Whether a full area path is one of the selected ones; an empty selection keeps every item.
 *
 * An exact full-path match — a parent path does not bring its sub-areas along — so picking a lane
 * shows that lane and nothing nested under it. Compared without case because Azure DevOps treats
 * area paths that way, so a hand-typed path still matches the canonical one the server returns.
 */
export function isInAreaPaths(areaPath: string | null, selected: Iterable<string>): boolean {
  const wanted = areaPath?.toLocaleLowerCase() ?? null;
  let empty = true;
  for (const path of selected) {
    empty = false;
    if (path.toLocaleLowerCase() === wanted) return true;
  }
  return empty;
}

/**
 * Whether an item belongs to one of the configured area branches.
 *
 * Binding configuration names ownership boundaries rather than visible lanes, so selecting a
 * parent includes items in all of its descendant paths. The separator check prevents similarly
 * prefixed siblings such as `Api` and `Api Tools` from overlapping.
 */
export function isInAreaPathBranches(areaPath: string | null, branches: Iterable<string>): boolean {
  const wanted = areaPath?.toLocaleLowerCase() ?? null;
  let empty = true;
  for (const rawBranch of branches) {
    empty = false;
    const branch = rawBranch.replace(/\\+$/, "").toLocaleLowerCase();
    if (wanted === branch || wanted?.startsWith(`${branch}\\`) === true) return true;
  }
  return empty;
}
