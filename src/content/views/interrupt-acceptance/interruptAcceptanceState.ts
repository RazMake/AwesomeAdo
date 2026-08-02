import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { hasWorkItemTag } from "../../../common/ado/workItemTags";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

export interface InterruptAcceptanceState {
  acceptedIds: Set<number>;
  failedIds: Set<number>;
}

/** Resolve acceptance only for items currently carrying the team's configured Interrupt tag. */
export async function loadInterruptAcceptanceState(
  roots: readonly TrackedWorkItem[],
  services: EnhancedViewServices,
): Promise<InterruptAcceptanceState> {
  const { tag, commentTag } = services.markerTags().interrupt;
  const workItemIds = collectItems(roots)
    .filter((item) => hasWorkItemTag(item.tags, tag))
    .map((item) => item.id);
  if (workItemIds.length === 0 || tag.length === 0 || commentTag.length === 0) {
    return { acceptedIds: new Set<number>(), failedIds: new Set<number>() };
  }
  const result = await services.interruptAcceptance.readInterruptAcceptance({
    workItemIds,
    interruptTag: tag,
    acceptanceTag: commentTag,
  });
  return {
    acceptedIds: new Set(result.acceptedWorkItemIds),
    failedIds: new Set(result.failedWorkItemIds),
  };
}

function collectItems(roots: readonly TrackedWorkItem[]): TrackedWorkItem[] {
  const items: TrackedWorkItem[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    items.push(item);
    pending.push(...item.children);
  }
  return items;
}
