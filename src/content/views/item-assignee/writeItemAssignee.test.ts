import { describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../common/logging/ILogger";

import { writeItemAssignee } from "./writeItemAssignee";

const logger: ILogger = { info: vi.fn(), error: vi.fn() };

function assignedItem(): TrackedWorkItem {
  return {
    id: 7,
    rev: 3,
    title: "Work",
    type: "Feature",
    state: "Active",
    priority: null,
    assignedTo: { displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "2026-01-01T00:00:00Z",
    description: "",
    noteCount: 0,
    tags: [],
    importance: 1,
    eta: null,
    children: [],
  };
}

describe("writeItemAssignee", () => {
  it("clears the assignment and folds back the committed revision", async () => {
    const item = assignedItem();
    const write = vi.fn(async () => ({ ok: true as const, rev: 4 }));
    const committed = vi.fn();

    writeItemAssignee(item, null, new WorkItemWriteQueue(write, logger), committed);
    await vi.waitFor(() => expect(committed).toHaveBeenCalledWith(null));

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        rev: 3,
        field: "System.AssignedTo",
        value: null,
      }),
    );
    expect(item.assignedTo).toBeNull();
    expect(item.rev).toBe(4);
  });
});
