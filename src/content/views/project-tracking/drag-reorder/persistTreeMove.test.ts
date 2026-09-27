import { describe, expect, it, vi } from "vitest";

import type { WorkItemReorderResult } from "../../../../common/ado/IWorkItemReorderWriter";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../../common/logging/ILogger";
import type { PlannedMove } from "../../../../common/view-common/control/DragReorder/DragReorderController";

import { persistTreeMove } from "./persistTreeMove";

function item(id: number, importance: number, children: TrackedWorkItem[] = []): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Feature",
    title: `Item ${id}`,
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "",
    createdBy: null,
    changedDate: "",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    tags: [],
    importance,
    noteCount: 0,
    eta: null,
    children,
  };
}

/** root(0) → consumer 10 [requests 1, 2] and consumer 20 [request 3]. */
function buildTree(): TrackedWorkItem {
  return item(0, 0, [
    item(10, 100, [item(1, 1000), item(2, 2000)]),
    item(20, 200, [item(3, 3000)]),
  ]);
}

/** Move request 1 from consumer 10 to the end of consumer 20. */
const CROSS_PARENT_MOVE: PlannedMove = {
  id: 1,
  currentParentId: 10,
  parentId: 20,
  previousId: 3,
  nextId: 0,
  siblingIds: [3, 1],
};

function harness(result: WorkItemReorderResult) {
  const enqueueReorder = vi.fn<(request: unknown) => Promise<WorkItemReorderResult>>(
    async () => result,
  );
  const queue = { enqueueReorder } as unknown as WorkItemWriteQueue;
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  return { enqueueReorder, queue, logger, root: buildTree() };
}

const childIds = (parent: TrackedWorkItem): number[] => parent.children.map((child) => child.id);

describe("persistTreeMove", () => {
  it("sends the move for the team and re-homes the item once ADO accepts it", async () => {
    const { enqueueReorder, queue, logger, root } = harness({
      ok: true,
      rev: 5,
      order: 3500,
      ranks: [{ id: 3, rank: 3000, rev: 4 }],
    });

    const changed = await persistTreeMove({
      root,
      move: CROSS_PARENT_MOVE,
      team: "t",
      queue,
      logger,
    });

    expect(changed).toBe(true);
    const request = enqueueReorder.mock.calls[0]![0] as { currentRev(): number; team: string };
    expect(request).toMatchObject({ id: 1, parentId: 20, currentParentId: 10, team: "t" });
    // The rev is read live, so it tracks the item's copy as the move folds its new rev back.
    expect(request.currentRev()).toBe(5);
    const [consumer10, consumer20] = root.children;
    expect(childIds(consumer10!)).toEqual([2]);
    expect(childIds(consumer20!)).toEqual([3, 1]);
    expect(consumer20!.children[1]).toMatchObject({ rev: 5, importance: 3500 });
    expect(consumer20!.children[0]!.rev).toBe(4);
  });

  it("applies a converted type the move carries", async () => {
    const { queue, logger, root } = harness({ ok: true, rev: 2, order: 10 });

    await persistTreeMove({
      root,
      move: { ...CROSS_PARENT_MOVE, type: "Story" },
      team: "t",
      queue,
      logger,
    });

    expect(root.children[1]!.children[1]!.type).toBe("Story");
  });

  it("leaves the tree alone when ADO rejects the move", async () => {
    const { queue, logger, root } = harness({ ok: false, error: "conflict" });

    const changed = await persistTreeMove({
      root,
      move: CROSS_PARENT_MOVE,
      team: "t",
      queue,
      logger,
    });

    expect(changed).toBe(false);
    expect(childIds(root.children[0]!)).toEqual([1, 2]);
  });

  it("still re-homes an item whose re-parent landed but whose ranking failed", async () => {
    const { queue, logger, root } = harness({ ok: false, reparented: true, rev: 3, error: "rank" });

    const changed = await persistTreeMove({
      root,
      move: CROSS_PARENT_MOVE,
      team: "t",
      queue,
      logger,
    });

    expect(changed).toBe(true);
    expect(childIds(root.children[1]!)).toEqual([3, 1]);
  });

  it("declines and logs a move for an item the tree no longer holds", async () => {
    const { enqueueReorder, queue, logger, root } = harness({ ok: true });

    const changed = await persistTreeMove({
      root,
      move: { ...CROSS_PARENT_MOVE, id: 99 },
      team: "t",
      queue,
      logger,
    });

    expect(changed).toBe(false);
    expect(enqueueReorder).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Drag-reorder aborted: item 99 is not in the rendered tree.",
    );
  });
});
