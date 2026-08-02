import { isoEpoch } from "../datetime/isoEpoch";
import { orderItems, type OrderingPolicy } from "../ordering/ItemOrdering";

import type { TrackedWorkItem, TypeCatalogEntry } from "./TrackedWorkItem";

/**
 * Derivations over the configured work item type catalog and the items typed by it.
 *
 * These answers decide what a view shows and in which order, so every view has to reach the same
 * one: two copies of "which types are primary work" or "how does the ordering policy see an item"
 * drift into two boards that disagree about the same query.
 */

/**
 * The type's hex color (with `#`), or `null` when the type carries none.
 *
 * Settings store the color WITHOUT the `#`, and a type may carry no color at all. Normalizing both
 * cases here means no caller has to remember which of the two it is looking at — an unset color
 * becomes an explicit "no color" rather than a bare `#` that silently invalidates the CSS it lands
 * in.
 */
export function workItemTypeColor(color: string | null | undefined): string | null {
  if (color === null || color === undefined || color.length === 0) {
    return null;
  }
  return color.startsWith("#") ? color : `#${color}`;
}

/**
 * The type's hex color, falling back to the theme's primary text color.
 *
 * For the places the color paints TEXT: an uncolored type must still be readable, so it inherits the
 * theme's foreground instead of disappearing.
 */
export function workItemTypeTextColor(color: string | null | undefined): string {
  return workItemTypeColor(color) ?? "var(--text-primary-color)";
}

/** Every type reachable from `seeds` by walking parent → child links. */
function typesBelow(
  types: readonly TypeCatalogEntry[],
  seeds: ReadonlySet<string>,
): ReadonlySet<string> {
  const reached = new Set(seeds);
  const pending = [...seeds];
  while (pending.length > 0) {
    const name = pending.pop() as string;
    for (const child of types.find((type) => type.name === name)?.children ?? []) {
      if (reached.has(child)) continue;
      reached.add(child);
      pending.push(child);
    }
  }
  return reached;
}

/** Every type that has a child leading down to `targets`, `targets` themselves aside. */
function typesAbove(
  types: readonly TypeCatalogEntry[],
  targets: ReadonlySet<string>,
): ReadonlySet<string> {
  const reaching = new Set(targets);
  const ancestors = new Set<string>();
  // A fixed point rather than one pass: a grandparent only qualifies once its child has, and the
  // catalog is in no guaranteed order. A target that is itself a parent of another target still
  // counts as an ancestor — being trackable delivery does not stop it from holding work below it.
  let previousSize = -1;
  while (previousSize !== reaching.size) {
    previousSize = reaching.size;
    for (const type of types) {
      if (type.children?.some((child) => reaching.has(child)) === true) {
        ancestors.add(type.name);
        reaching.add(type.name);
      }
    }
  }
  return ancestors;
}

/** The types the team marked as independently trackable delivery. */
export function primaryWorkTypes(types: readonly TypeCatalogEntry[]): ReadonlySet<string> {
  return new Set(types.filter((type) => type.isPrimaryWork === true).map((type) => type.name));
}

/**
 * Primary work plus everything configured beneath it — the work that counts toward a person's load.
 *
 * A story's tasks are the same delivery seen closer up, so counting them against the person who owns
 * the story is counting the same commitment twice at two zoom levels.
 */
export function primaryWorkWithDescendants(
  types: readonly TypeCatalogEntry[],
): ReadonlySet<string> {
  return typesBelow(types, primaryWorkTypes(types));
}

/**
 * Only the types that lead down to primary work — the planning context a view groups by.
 *
 * Primary work reached from nothing is excluded on purpose: an Epic is something to group BY, while
 * the leaf Feature under it is what is being grouped.
 */
export function primaryWorkAncestors(types: readonly TypeCatalogEntry[]): ReadonlySet<string> {
  return typesAbove(types, primaryWorkTypes(types));
}

/** Primary work plus every configured ancestor needed to reach it — the types a tree shows as rows. */
export function primaryWorkWithAncestors(types: readonly TypeCatalogEntry[]): ReadonlySet<string> {
  const primary = primaryWorkTypes(types);
  return new Set([...primary, ...typesAbove(types, primary)]);
}

/**
 * Orders work items by a binding's policy.
 *
 * `common/ordering` owns what each policy means and stays free of any ADO shape, so this is the one
 * place a tracked item is adapted to what it asks for: an item stores its ETA as an ISO string, but
 * the policy compares epoch milliseconds. `itemOf` lets a caller order its own wrappers (a board
 * entry carrying ancestry, say) without unwrapping them first; the ordered entries are handed back
 * untouched.
 */
export function orderTrackedItems<T>(
  entries: readonly T[],
  itemOf: (entry: T) => TrackedWorkItem,
  policy: OrderingPolicy,
): T[] {
  return orderItems(
    entries.map((entry) => {
      const item = itemOf(entry);
      return {
        entry,
        importance: item.importance,
        title: item.title,
        eta: isoEpoch(item.eta),
      };
    }),
    policy,
  ).map(({ entry }) => entry);
}
