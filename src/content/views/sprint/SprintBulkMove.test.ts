import { describe, expect, it, vi } from "vitest";

import type { WorkItemFieldWriteResult } from "../../../common/ado/IWorkItemFieldWriter";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { QueuedFieldWrite } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../common/logging/ILogger";

import {
  runSprintBulkMove,
  type SprintBulkMoveCandidate,
  type SprintBulkMoveOptions,
  type SprintBulkMoveProgress,
} from "./SprintBulkMove";

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

function candidate(id: number): SprintBulkMoveCandidate {
  return {
    id,
    areaPath: "Project\\API",
    assigneeValue: "alice@example.com",
    assigneeLabel: "Alice",
  };
}

function enqueueSpy() {
  return vi.fn<(request: QueuedFieldWrite) => Promise<WorkItemFieldWriteResult>>();
}

function enqueuedIds(enqueue: ReturnType<typeof enqueueSpy>): number[] {
  return enqueue.mock.calls.map(([request]) => request.id);
}

function options(overrides: Partial<SprintBulkMoveOptions> = {}): SprintBulkMoveOptions {
  return {
    sourcePath: SOURCE,
    destinationPath: DESTINATION,
    destinationName: "Sprint 2",
    candidates: [candidate(1)],
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

describe("runSprintBulkMove write guard", () => {
  it("fresh-reads the fixed snapshot and atomically guards state, lane, and assignee", async () => {
    const moving = item(1);
    moving.rev = 5;
    const loadRoots = vi.fn().mockResolvedValueOnce([moving]);
    const revsAtWrite: number[] = [];
    const enqueue = enqueueSpy().mockImplementation(async (request) => {
      revsAtWrite.push(request.currentRev());
      return { ok: true, rev: 9 };
    });
    const onProgress = vi.fn<(progress: SprintBulkMoveProgress) => void>();

    const result = await runSprintBulkMove(options({ loadRoots, writes: { enqueue }, onProgress }));

    expect(loadRoots).toHaveBeenCalledTimes(1);
    const [request] = enqueue.mock.calls[0]!;
    const { currentRev, ...guarded } = request;
    expect(guarded).toEqual({
      id: 1,
      field: "System.IterationPath",
      value: DESTINATION,
      baseValue: SOURCE,
      preconditions: [
        { field: "System.State", value: "Active" },
        { field: "System.AreaPath", value: "Project\\API" },
        { field: "System.AssignedTo", value: "alice@example.com" },
      ],
    });
    // The rev guard is the whole point of the resolver: it must report the rev of the item this
    // pass just re-read, and must keep tracking that live item rather than freezing a copy.
    expect(revsAtWrite).toEqual([5]);
    expect(moving.rev).toBe(9);
    expect(currentRev()).toBe(9);
    moving.rev = 42;
    expect(currentRev()).toBe(42);
    expect(result).toEqual({
      phase: "completed",
      pass: 1,
      moved: 1,
      failed: 0,
      skipped: 0,
      examined: 1,
      lastError: undefined,
    });
    expect(onProgress.mock.calls.map(([progress]) => [progress.phase, progress.moved])).toEqual([
      ["running", 1],
      ["completed", 1],
    ]);
  });
});

describe("runSprintBulkMove eligibility guards", () => {
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

describe("runSprintBulkMove retries", () => {
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

  it("reports a permanent write failure once, without retrying or waiting", async () => {
    const enqueue = enqueueSpy().mockResolvedValue({ ok: false, error: "HTTP 400" });
    const wait = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined);
    const onProgress = vi.fn<(progress: SprintBulkMoveProgress) => void>();

    const result = await runSprintBulkMove(
      options({ loadRoots: async () => [item(1)], writes: { enqueue }, wait, onProgress }),
    );

    expect(enqueuedIds(enqueue)).toEqual([1]);
    expect(wait).not.toHaveBeenCalled();
    expect(result).toEqual({
      phase: "completed",
      pass: 1,
      moved: 0,
      failed: 1,
      skipped: 0,
      examined: 1,
      lastError: "HTTP 400",
    });
    expect(onProgress.mock.calls.map(([progress]) => [progress.phase, progress.failed])).toEqual([
      ["running", 1],
      ["completed", 1],
    ]);
  });
});

describe("runSprintBulkMove traversal and cancellation", () => {
  it("finishes the current write and then cancels the remaining items", async () => {
    let cancelled = false;
    const enqueue = enqueueSpy().mockImplementation(async () => {
      cancelled = true;
      return { ok: true, rev: 2 };
    });

    const result = await runSprintBulkMove(
      options({
        loadRoots: async () => [item(1), item(2)],
        candidates: [candidate(1), candidate(2)],
        writes: { enqueue },
        cancelled: () => cancelled,
      }),
    );

    // The traversal pops its pending stack, so the LAST confirmed root is the one in flight when
    // the cancel lands; naming it is what proves the right item was the one allowed to finish.
    expect(enqueuedIds(enqueue)).toEqual([2]);
    expect(enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(result).toEqual({
      phase: "cancelled",
      pass: 1,
      moved: 1,
      failed: 0,
      skipped: 0,
      examined: 2,
      lastError: undefined,
    });
  });

  it("writes confirmed items in its documented stack-traversal order", async () => {
    const enqueue = enqueueSpy().mockResolvedValue({ ok: true, rev: 2 });
    const parent = item(1);
    parent.children = [item(3)];

    const result = await runSprintBulkMove(
      options({
        loadRoots: async () => [parent, item(2)],
        candidates: [candidate(1), candidate(2), candidate(3)],
        writes: { enqueue },
      }),
    );

    // Roots come out last-first because the traversal pops, and a child follows its own parent.
    expect(enqueuedIds(enqueue)).toEqual([2, 1, 3]);
    expect(result).toMatchObject({ phase: "completed", moved: 3, failed: 0, skipped: 0 });
  });
});

describe("runSprintBulkMove safety bounds", () => {
  it("stops at the configured pass bound when a conflict never settles", async () => {
    const firstPass = item(1);
    firstPass.rev = 10;
    const secondPass = item(1);
    secondPass.rev = 11;
    const loadRoots = vi
      .fn()
      .mockResolvedValueOnce([firstPass])
      .mockResolvedValueOnce([secondPass]);
    const revsAtWrite: number[] = [];
    const enqueue = enqueueSpy().mockImplementation(async (request) => {
      revsAtWrite.push(request.currentRev());
      return { ok: false, error: "HTTP 412" };
    });

    const result = await runSprintBulkMove(
      options({ loadRoots, writes: { enqueue }, limits: { maxPasses: 2, maxItems: 10 } }),
    );

    // A bounded run still has to do the work of each pass: re-read the source, then retry the
    // conflicted item against the rev that re-read reported.
    expect(loadRoots).toHaveBeenCalledTimes(2);
    expect(enqueuedIds(enqueue)).toEqual([1, 1]);
    expect(revsAtWrite).toEqual([10, 11]);
    expect(result).toEqual({
      phase: "limited",
      pass: 2,
      moved: 0,
      failed: 0,
      skipped: 0,
      examined: 1,
      lastError: "HTTP 412",
    });
  });
});
