import { expect, it, vi } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

import { loadInterruptAcceptanceState } from "./interruptAcceptanceState";

it("asks only about currently interrupt-tagged items and preserves failed ids", async () => {
  const readInterruptAcceptance = vi.fn().mockResolvedValue({
    acceptedWorkItemIds: [2],
    failedWorkItemIds: [3],
    error: "partial",
  });
  const roots = [
    { id: 1, tags: [], children: [] },
    { id: 2, tags: ["interrupt"], children: [{ id: 3, tags: ["Interrupt"], children: [] }] },
  ] as unknown as TrackedWorkItem[];
  const services = {
    markerTags: () => ({ interrupt: { tag: "Interrupt", commentTag: "[ACCEPTED]" } }),
    interruptAcceptance: { readInterruptAcceptance },
  } as unknown as EnhancedViewServices;

  const state = await loadInterruptAcceptanceState(roots, services);

  expect(readInterruptAcceptance).toHaveBeenCalledWith({
    workItemIds: [2, 3],
    interruptTag: "Interrupt",
    acceptanceTag: "[ACCEPTED]",
  });
  expect([...state.acceptedIds]).toEqual([2]);
  expect([...state.failedIds]).toEqual([3]);
});
