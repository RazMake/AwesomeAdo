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

/**
 * Maps a work item's ADO State (`System.State`) to the application Status — the board-column label
 * it is routed onto. Falls back to the raw ADO State when the type declares no matching column, so
 * an unmapped state is still shown rather than blanked.
 *
 * Matched case/whitespace-insensitively: ADO can echo a state with different casing than the one the
 * team recorded in its column config, and an exact compare would then miss the mapping and leak the
 * raw ADO State into the badge instead of the intended application Status.
 */
export function workItemStatusLabel(
  item: TrackedWorkItem,
  entry: TypeCatalogEntry | undefined,
): string {
  const itemState = item.state.trim().toLowerCase();
  const column = entry?.columns.find((col) =>
    col.states.some((state) => state.trim().toLowerCase() === itemState),
  );
  return column?.column ?? item.state;
}

/**
 * The zero-based position of a status label in the team's global board-column order, or -1 when the
 * label maps to no board column. Status color is keyed off this position so the same board column
 * reads identically for every work-item type. Matched case/whitespace-insensitively for the same
 * reason as the status label itself.
 */
export function boardColumnOrdinal(label: string, boardColumns: readonly string[]): number {
  const target = label.trim().toLowerCase();
  return boardColumns.findIndex((column) => column.trim().toLowerCase() === target);
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

interface WorkItemIndex {
  /** Every item under the roots, roots included, parents ahead of their children. */
  items: TrackedWorkItem[];
  /** Child id → parent id, so a match can be walked back up without re-searching the tree. */
  parentIds: Map<number, number>;
}

// One walk answers both questions a filter pass asks, because a board repaints on every pill click
// and re-walking the whole tree once per question is work the reader waits through.
function indexWorkItems(roots: readonly TrackedWorkItem[]): WorkItemIndex {
  const items: TrackedWorkItem[] = [];
  const parentIds = new Map<number, number>();
  const visit = (item: TrackedWorkItem, parentId: number | null): void => {
    items.push(item);
    if (parentId !== null) parentIds.set(item.id, parentId);
    for (const child of item.children) visit(child, item.id);
  };
  for (const root of roots) visit(root, null);
  return { items, parentIds };
}

/** Every item under `roots`, the roots included, in the order a reader sees them top to bottom. */
export function flattenWorkItems(roots: readonly TrackedWorkItem[]): TrackedWorkItem[] {
  return indexWorkItems(roots).items;
}

function addAncestorIds(
  id: number,
  parentIds: ReadonlyMap<number, number>,
  visible: Set<number>,
): void {
  let currentId: number | undefined = id;
  // Stopping at the first already-recorded id is not just a shortcut: sibling matches share most of
  // their chain, and a query that returns one item at two depths makes the parent links circular.
  while (currentId !== undefined && !visible.has(currentId)) {
    visible.add(currentId);
    currentId = parentIds.get(currentId);
  }
}

function addImplementationDescendantIds(
  item: TrackedWorkItem,
  primaryTypes: ReadonlySet<string>,
  visible: Set<number>,
): void {
  for (const child of item.children) {
    if (primaryTypes.has(child.type)) continue;
    visible.add(child.id);
    addImplementationDescendantIds(child, primaryTypes, visible);
  }
}

/**
 * Whether an item is one the filters get to judge.
 *
 * Returned as a predicate so a caller that already holds a flattened list — a board that wrapped
 * each item in its own row entry, say — can narrow it without walking the tree a second time.
 * Everything qualifies while Primary work remains unconfigured, which is what keeps an unclassified
 * catalog on the legacy "every item can match" rule.
 */
export function primaryFilterEligibility(
  types: readonly TypeCatalogEntry[],
): (item: TrackedWorkItem) => boolean {
  const primaryTypes = primaryWorkTypes(types);
  return (item) => primaryTypes.size === 0 || primaryTypes.has(item.type);
}

/** The work items filters evaluate, or every item while Primary work remains unconfigured. */
export function workItemsEligibleForPrimaryFilter(
  roots: readonly TrackedWorkItem[],
  types: readonly TypeCatalogEntry[],
): TrackedWorkItem[] {
  return flattenWorkItems(roots).filter(primaryFilterEligibility(types));
}

/**
 * Resolves hierarchy visibility when filters describe independently trackable delivery.
 *
 * A matching Primary-work item carries its planning ancestors and implementation descendants with
 * it. Another Primary-work node still has to match for itself, so nested delivery does not bypass
 * the filter merely because its parent matched. Catalogs without classification preserve the legacy
 * rule where every item can match and matching descendants retain their ancestor chain.
 */
export function workItemIdsVisibleUnderPrimaryFilter(
  roots: readonly TrackedWorkItem[],
  types: readonly TypeCatalogEntry[],
  matches: (item: TrackedWorkItem) => boolean,
): ReadonlySet<number> {
  const primaryTypes = primaryWorkTypes(types);
  const isEligible = primaryFilterEligibility(types);
  const { items, parentIds } = indexWorkItems(roots);
  const visible = new Set<number>();
  for (const item of items) {
    if (!isEligible(item) || !matches(item)) continue;
    addAncestorIds(item.id, parentIds, visible);
    if (primaryTypes.size > 0) addImplementationDescendantIds(item, primaryTypes, visible);
  }
  return visible;
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
