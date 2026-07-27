/**
 * Whether `target` is reachable from `start` by following parent→child work-item-type links.
 *
 * Shared by the normalizer (which prunes any stored or imported link that would close a loop) and by
 * the options picker (which refuses to offer one), so both answer "would this create a cycle?" with
 * exactly the same rule. Consumers walk the hierarchy recursively, so a loop would never terminate.
 *
 * Keys and values are compared as-is: callers pass names already lowercased, since type names are
 * matched case-insensitively everywhere else in the settings layer.
 */
export function reachesWorkItemType(
  links: ReadonlyMap<string, readonly string[]>,
  start: string,
  target: string,
): boolean {
  const visited = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (current === target) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(...(links.get(current) ?? []));
  }
  return false;
}
