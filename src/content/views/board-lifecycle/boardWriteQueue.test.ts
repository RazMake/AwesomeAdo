import { describe, expect, it, vi } from "vitest";

import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

import { createBoardWriteQueue } from "./boardWriteQueue";

describe("createBoardWriteQueue", () => {
  it("sends field edits and moves through the board's services", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 2 }));
    const reorderItem = vi.fn(async () => ({ ok: true, rev: 3 }));
    const queue = createBoardWriteQueue({
      writeField,
      reorderItem,
      logger: { info: () => undefined, error: () => undefined },
    } as unknown as Pick<EnhancedViewServices, "writeField" | "reorderItem" | "logger">);

    await queue.enqueue({ id: 1, currentRev: () => 1, field: "System.State", value: "Done" });
    await queue.enqueueReorder({
      id: 1,
      currentRev: () => 2,
      parentId: 10,
      currentParentId: 10,
      previousId: 0,
      nextId: 0,
      siblingIds: [1],
      team: "team",
    });

    expect(writeField).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, field: "System.State", value: "Done", rev: 1 }),
    );
    expect(reorderItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, parentId: 10, rev: 2 }),
    );
  });
});
