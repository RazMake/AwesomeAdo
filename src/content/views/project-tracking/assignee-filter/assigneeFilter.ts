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
 * The distinct people assigned to Primary work or to anything configured beneath it.
 *
 * Deliberately narrower than "everyone in the tree": the planning levels above Primary work carry
 * owners (a Tech Lead, a milestone owner) who are accountable for a branch rather than working in
 * it, and offering them here would answer "show me this person's work" with a whole project.
 *
 * A catalog with no Primary work flagged has no such distinction to draw, so every assigned person
 * is offered — the same legacy rule the rest of the board falls back to.
 */
export function assigneesInPrimaryWork(
  roots: readonly TrackedWorkItem[],
  types: readonly TypeCatalogEntry[],
): AssigneeOption[] {
  const delivery = primaryWorkWithDescendants(types);
  const byKey = new Map<string, AssigneeOption>();
  for (const item of flattenWorkItems(roots)) {
    if (delivery.size > 0 && !delivery.has(item.type)) continue;
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
