import {
  MANUAL_ORDERING_POLICY,
  type OrderingPolicy,
} from "../../../../common/ordering/ItemOrdering";

/**
 * Why a tree board cannot offer drag-to-reorder right now, or null when it can.
 *
 * Backlog rank is per team in Azure DevOps, so without a configured team there is nothing to rank a
 * dragged item against. And only the manual backlog rank can be rearranged by hand: every other
 * policy is derived from the items themselves, so a move made under one of them would be undone by
 * the very next sort. The board shows the reason on its ordering glyph instead of offering a handle
 * that would fail or be undone.
 */
export function dragReorderUnavailableReason(
  team: string | null,
  policy: OrderingPolicy,
): string | null {
  if (team === null) {
    return "drag to reorder needs a team (set one in AwesomeADO options)";
  }
  return policy === MANUAL_ORDERING_POLICY
    ? null
    : "drag to reorder is only available when ordering by importance";
}
