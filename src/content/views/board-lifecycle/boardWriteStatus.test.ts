import { describe, expect, it, vi } from "vitest";

import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";

import { createBoardWriteStatus } from "./boardWriteStatus";

async function flush(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
}

describe("createBoardWriteStatus", () => {
  it("seeds every freshly rendered indicator with the failures reported so far", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const queue = new WorkItemWriteQueue(async () => ({ ok: false, error: "denied" }), logger);
    const openLog = vi.fn();
    const status = createBoardWriteStatus(document, queue, openLog);

    const first = status.render();
    expect(first.textContent).not.toContain("Couldn't save");

    await queue.enqueue({ id: 1, currentRev: () => 1, field: "System.Title", value: "x" });
    await flush();
    expect(first.textContent).toContain("Couldn't save 1 change");

    // A repaint replaces the indicator; the new one still carries the rejected edit and its cause.
    const second = status.render();
    expect(second.textContent).toContain("Couldn't save 1 change");
    expect(second.title).toContain("denied");
    second.click();
    expect(openLog).toHaveBeenCalledTimes(1);
  });
});
