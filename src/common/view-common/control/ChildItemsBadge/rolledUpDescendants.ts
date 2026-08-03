import type { TrackedWorkItem } from "../../../ado/TrackedWorkItem";
import { orderTrackedItems } from "../../../ado/workItemTypes";
import type { OrderingPolicy } from "../../../ordering/ItemOrdering";

/** One descendant a `ChildItemsBadge` summarizes, with what a row needs to describe and move it. */
export interface RolledUpDescendant {
  item: TrackedWorkItem;
  /** The item this one hangs off — a drop target, and the source of its allowed child type. */
  parent: TrackedWorkItem;
  /** The full ordered level this item belongs to, including anything the badge hides. */
  siblingIds: readonly number[];
  /** Zero-based depth within the popup: the badge indents each level below the first. */
  depth: number;
}

/**
 * Flattens everything a badge rolls up beneath `parent`, deepest levels included.
 *
 * A view stops rendering rows somewhere — at implementation detail, or at a depth cap — and every
 * level below that point has to arrive somewhere or it is simply lost from the board. Ordering is
 * applied per level rather than to the flattened result so each level keeps the reader's chosen
 * order underneath the item it belongs to.
 */
export function collectRolledUpDescendants(
  parent: TrackedWorkItem,
  isRolledUp: (child: TrackedWorkItem, depth: number) => boolean,
  orderingPolicy: OrderingPolicy,
  depth = 0,
): RolledUpDescendant[] {
  const children = orderTrackedItems(
    parent.children.filter((child) => isRolledUp(child, depth)),
    (child) => child,
    orderingPolicy,
  );
  const siblingIds = children.map((child) => child.id);
  return children.flatMap((child) => [
    { item: child, parent, siblingIds, depth },
    ...collectRolledUpDescendants(child, isRolledUp, orderingPolicy, depth + 1),
  ]);
}
