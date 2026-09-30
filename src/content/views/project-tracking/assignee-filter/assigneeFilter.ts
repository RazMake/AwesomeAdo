import { deriveAlias } from "../../../../common/ado/FeatureCrew";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import { flattenWorkItems, primaryWorkWithDescendants } from "../../../../common/ado/workItemTypes";

/** One person the Assigned To filter offers. */
export interface AssigneeOption {
  /**
   * The value exchanged with the filter control: the person's alias, lower-cased.
   *
   * The alias rather than the display name, because two people can share a display name while an
   * alias identifies exactly one of them — filtering on the name would silently merge their work.
   */
  key: string;
  /** How the person reads in the dropdown: their name, plus their Feature Crew tag when they wear one. */
  label: string;
}

/** The key one work item filters under, or null when nobody is assigned to it. */
export function assigneeKeyOf(item: TrackedWorkItem): string | null {
  const user = item.assignedTo;
  return user === null ? null : deriveAlias(user.uniqueName, user.displayName).toLowerCase();
}

/**
 * The distinct people assigned to any item in the tree, planning levels included.
 *
 * Owners of planning items (a Feature, a milestone) are offered too: selecting them shows the items
 * they own even when nobody beneath is theirs — see {@link planningIdsOwnedBySelection}.
 */
export function assigneesInTree(roots: readonly TrackedWorkItem[]): AssigneeOption[] {
  const byKey = new Map<string, AssigneeOption>();
  for (const item of flattenWorkItems(roots)) {
    const key = assigneeKeyOf(item);
    const user = item.assignedTo;
    if (key === null || user === null || byKey.has(key)) continue;
    const tag = user.tag;
    byKey.set(key, {
      key,
      label: tag ? `${user.displayName} (${tag})` : user.displayName,
    });
  }
  return [...byKey.values()].sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
  );
}

/**
 * Ids of planning items (above Primary work) assigned to a selected person, plus their ancestors.
 *
 * The Primary-work filter pass never judges a planning item that holds delivery, so without this a
 * selected Feature owner would show nothing whenever none of the Feature's work is theirs. `accepts`
 * lets the caller still apply its other filters to the owned item.
 */
export function planningIdsOwnedBySelection(
  root: TrackedWorkItem,
  types: readonly TypeCatalogEntry[],
  selected: ReadonlySet<string>,
  accepts: (item: TrackedWorkItem) => boolean,
): Set<number> {
  const ids = new Set<number>();
  if (selected.size === 0) return ids;
  const delivery = primaryWorkWithDescendants(types);
  const visit = (item: TrackedWorkItem, ancestors: readonly number[]): void => {
    const key = assigneeKeyOf(item);
    if (!delivery.has(item.type) && key !== null && selected.has(key) && accepts(item)) {
      ids.add(item.id);
      for (const id of ancestors) ids.add(id);
    }
    for (const child of item.children) visit(child, [...ancestors, item.id]);
  };
  visit(root, []);
  return ids;
}

/**
 * Whether an item, or anything beneath it, is assigned to one of the selected people.
 *
 * The subtree is included because the filter offers people who may only ever appear on the tasks
 * under a story somebody else owns: judging the story on its own assignee would offer a name that
 * empties the board. An empty selection narrows nothing, matching every other filter group.
 */
export function matchesAssigneeFilter(
  item: TrackedWorkItem,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true;
  const key = assigneeKeyOf(item);
  if (key !== null && selected.has(key)) return true;
  return item.children.some((child) => matchesAssigneeFilter(child, selected));
}
