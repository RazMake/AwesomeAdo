/**
 * How a Project Tracking view orders the items within each group, and the logic that applies it.
 *
 * The chosen policy is stored on the query binding (see the Project Tracking view's `orderingPolicy`
 * property in `src/content/views/project-tracking`) and turned into a concrete ordering here, so every
 * place that renders items shares one definition of "most important first" / "a–z" / "by ETA" instead
 * of re-deriving the rules.
 */

/** The available ways to order items; each maps to one entry in {@link ORDERING_POLICIES}. */
export type OrderingPolicy = "importance" | "title" | "eta";

/** A pickable ordering policy: the stored `value` and the label shown in the picker. */
export interface OrderingPolicyOption {
  value: OrderingPolicy;
  label: string;
}

/** The ordering policies offered, in picker order. The first entry is the default. */
export const ORDERING_POLICIES: readonly OrderingPolicyOption[] = [
  { value: "importance", label: "By Importance (most important first)" },
  { value: "title", label: "By Title (a-z)" },
  { value: "eta", label: "By ETA (past/recent - future)" },
];

/** The policy a binding uses until the user picks another. */
export const DEFAULT_ORDERING_POLICY: OrderingPolicy = "importance";

/** The minimum an item must expose to be ordered by any policy. */
export interface OrderableItem {
  /** Manual backlog rank; a lower number means more important (higher in the backlog). */
  importance: number;
  /** Item title, compared case-insensitively for the alphabetical policy. */
  title: string;
  /** ETA as epoch milliseconds, or null when the item has none (ordered after every dated item). */
  eta: number | null;
}

/**
 * Return a new array of `items` ordered by `policy`, without mutating the input. The sort is stable,
 * so items that tie under the chosen policy keep their original relative order.
 */
export function orderItems<T extends OrderableItem>(
  items: readonly T[],
  policy: OrderingPolicy,
): T[] {
  return [...items].sort(comparatorFor(policy));
}

function comparatorFor(policy: OrderingPolicy): (a: OrderableItem, b: OrderableItem) => number {
  switch (policy) {
    case "title":
      return (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "eta":
      return compareByEta;
    case "importance":
    default:
      return (a, b) => a.importance - b.importance;
  }
}

/** Earlier ETAs first; an item without an ETA sorts after every item that has one. */
function compareByEta(a: OrderableItem, b: OrderableItem): number {
  if (a.eta === b.eta) {
    return 0;
  }
  if (a.eta === null) {
    return 1;
  }
  if (b.eta === null) {
    return -1;
  }
  return a.eta - b.eta;
}
