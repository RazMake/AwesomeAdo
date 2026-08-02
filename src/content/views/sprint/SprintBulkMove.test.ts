import { describe, expect, it, vi } from "vitest";

import type { WorkItemFieldWriteResult } from "../../../common/ado/IWorkItemFieldWriter";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { QueuedFieldWrite } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../common/logging/ILogger";

import { runSprintBulkMove, type SprintBulkMoveOptions } from "./SprintBulkMove";

const SOURCE = "Project\\Sprint 1";
const DESTINATION = "Project\\Sprint 2";

function item(id: number, state = "Active"): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    state,
    iterationPath: SOURCE,
    sprintName: "Sprint 1",
    areaPath: "Project\\API",
    assignedTo: {
      displayName: "Alice",
      uniqueName: "alice@example.com",
      imageUrl: null,
    },
    children: [],
  } as unknown as TrackedWorkItem;
}

function types(): TypeCatalogEntry[] {
  return [
    {
      name: "Story",
      color: "#0078d4",
      icon: "",
      isPrimaryWork: true,
      etaField: null,
      children: [],
      columns: [
        { column: "Queue", states: ["New"] },
        { column: "Active", states: ["Active"] },
        { column: "Waiting", states: ["Waiting"] },
        { column: "Done", states: ["Done"] },
        { column: "Removed", states: ["Removed"] },
      ],
    },
  ];
}

function logger(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function options(overrides: Partial<SprintBulkMoveOptions> = {}): SprintBulkMoveOptions {
  return {
    sourcePath: SOURCE,
    destinationPath: DESTINATION,
    destinationName: "Sprint 2",
    candidates: [
      {
        id: 1,
        areaPath: "Project\\API",
        assigneeValue: "alice@example.com",
        assigneeLabel: "Alice",
      },
    ],
    types: types(),
    loadRoots: async () => [],
    writes: { enqueue: vi.fn(async () => ({ ok: true, rev: 2 })) },
    cancelled: () => false,
    wait: async () => undefined,
    onProgress: vi.fn(),
    logger: logger(),
    ...overrides,
  };
}

describe("runSprintBulkMove guards", () => {
  it("fresh-reads the fixed snapshot and atomically guards state, lane, and assignee", async () => {
    const moving = item(1);
    const loadRoots = vi.fn().mockResolvedValueOnce([moving]);
    const enqueue = vi
      .fn<(request: QueuedFieldWrite) => Promise<WorkItemFieldWriteResult>>()
      .mockResolvedValue({ ok: true, rev: 2 });

    const result = await runSprintBulkMove(options({ loadRoots, writes: { enqueue } }));

    expect(loadRoots).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      id: 1,
      currentRev: expect.any(Function),
      field: "System.IterationPath",
      value: DESTINATION,
      baseValue: SOURCE,
      preconditions: [
        { field: "System.State", value: "Active" },
        { field: "System.AreaPath", value: "Project\\API" },
        { field: "System.AssignedTo", value: "alice@example.com" },
      ],
    });
    expect(result).toMatchObject({ phase: "completed", moved: 1, failed: 0, skipped: 0 });
  });

  it("does not move work that became Done before the fresh pass", async () => {
    const enqueue = vi.fn();

    const result = await runSprintBulkMove(
      options({ loadRoots: async () => [item(1, "Done")], writes: { enqueue } }),
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ phase: "completed", moved: 0, skipped: 1 });
  });

  it("defers a state conflict to a fresh pass, where Done work is excluded", async () => {
    const loadRoots = vi
      .fn()
      .mockResolvedValueOnce([item(1, "Active")])
      .mockResolvedValueOnce([item(1, "Done")]);
    const enqueue = vi.fn(async () => ({ ok: false, error: "HTTP 412 — guarded field changed" }));

    const result = await runSprintBulkMove(options({ loadRoots, writes: { enqueue } }));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      phase: "completed",
      moved: 0,
      failed: 0,
      skipped: 1,
      pass: 2,
    });
  });

  it("never adds an item that was not in the confirmed visible snapshot", async () => {
    const enqueue = vi
      .fn<(request: QueuedFieldWrite) => Promise<WorkItemFieldWriteResult>>()
      .mockResolvedValue({ ok: true, rev: 2 });

    await runSprintBulkMove(
      options({ loadRoots: async () => [item(1), item(2)], writes: { enqueue } }),
    );

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it.each([
    ["unassigned", { assignedTo: null }],
    ["reassigned", { assignedTo: { displayName: "Bob", uniqueName: "bob@example.com" } }],
    ["another lane", { areaPath: "Project\\UI" }],
  ])("skips a confirmed item that became %s before its write", async (_label, changes) => {
    const enqueue = vi.fn();
    const changed = Object.assign(item(1), changes);

    const result = await runSprintBulkMove(
      options({ loadRoots: async () => [changed], writes: { enqueue } }),
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ phase: "completed", moved: 0, skipped: 1 });
  });
});

describe("runSprintBulkMove lifecycle", () => {
  it("retries a transient write three times with exponential backoff", async () => {
    const moving = item(1);
    const loadRoots = vi.fn().mockResolvedValueOnce([moving]).mockResolvedValueOnce([]);
    const enqueue = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "HTTP 503" })
      .mockResolvedValueOnce({ ok: false, error: "network unavailable" })
      .mockResolvedValueOnce({ ok: false, error: "HTTP 429" })
      .mockResolvedValueOnce({ ok: true, rev: 2 });
    const wait = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined);

    const result = await runSprintBulkMove(options({ loadRoots, writes: { enqueue }, wait }));

    expect(enqueue).toHaveBeenCalledTimes(4);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([250, 500, 1000]);
    expect(result.moved).toBe(1);
  });

  it("finishes the current write and then cancels the remaining items", async () => {
    let cancelled = false;
    const enqueue = vi.fn(async () => {
      cancelled = true;
      return { ok: true, rev: 2 };
    });

    const result = await runSprintBulkMove(
      options({
        loadRoots: async () => [item(1), item(2)],
        candidates: [
          {
            id: 1,
            areaPath: "Project\\API",
            assigneeValue: "alice@example.com",
            assigneeLabel: "Alice",
          },
          {
            id: 2,
            areaPath: "Project\\API",
            assigneeValue: "alice@example.com",
            assigneeLabel: "Alice",
          },
        ],
        writes: { enqueue },
        cancelled: () => cancelled,
      }),
    );

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ phase: "cancelled", moved: 1 });
  });

  it("stops at the configured pass bound when a conflict never settles", async () => {
    const result = await runSprintBulkMove(
      options({
        loadRoots: async () => [item(1)],
        writes: { enqueue: async () => ({ ok: false, error: "HTTP 412" }) },
        limits: { maxPasses: 2, maxItems: 10 },
      }),
    );

    expect(result).toMatchObject({ phase: "limited", pass: 2, moved: 0, failed: 0 });
  });
});
