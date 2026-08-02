import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../logging/ILogger";
import type { WorkItemFieldWriteRequest, WorkItemFieldWriteResult } from "../IWorkItemFieldWriter";
import type { WorkItemReorderRequest, WorkItemReorderResult } from "../IWorkItemReorderWriter";

import {
  WorkItemWriteQueue,
  type QueuedFieldWrite,
  type QueuedReorder,
  type WriteField,
} from "./WorkItemWriteQueue";

/** A no-op logger that records calls so tests can assert on what was logged. */
function createRecordingLogger(): {
  logger: ILogger;
  infos: string[];
  errors: Array<{ message: string; error?: unknown }>;
} {
  const infos: string[] = [];
  const errors: Array<{ message: string; error?: unknown }> = [];
  return {
    logger: {
      info: (message) => infos.push(message),
      error: (message, error) => errors.push({ message, error }),
    },
    infos,
    errors,
  };
}

/** A queued write whose rev never moves — the common case where only one edit is in flight. */
const req = (
  id: number,
  rev: number,
  value: string | null,
  field = "System.State",
): QueuedFieldWrite => ({
  id,
  currentRev: () => rev,
  field,
  value,
});

/** The shape the queue is expected to hand the writer once it has bound the rev. */
const sent = (
  id: number,
  rev: number,
  value: string | null,
  field = "System.State",
): WorkItemFieldWriteRequest => ({
  id,
  rev,
  field,
  value,
});

/** A queued move; the rev resolver is supplied so the late-binding tests can vary what it reads. */
const move = (id: number, currentRev: () => number): QueuedReorder => ({
  id,
  currentRev,
  parentId: 20,
  currentParentId: 10,
  previousId: 3,
  nextId: 4,
  siblingIds: [3, 4],
  team: "Web",
});

/** The shape the queue is expected to hand the reorder function once it has bound the rev. */
const moveSent = (id: number, rev: number): WorkItemReorderRequest => ({
  id,
  rev,
  parentId: 20,
  currentParentId: 10,
  previousId: 3,
  nextId: 4,
  siblingIds: [3, 4],
  team: "Web",
});

/**
 * Records every `(count, lastError)` pair a failure listener is handed, including the immediate
 * on-subscribe one, so a test can assert on the reason as well as the count.
 */
const recordFailures = (queue: WorkItemWriteQueue): Array<[number, string | undefined]> => {
  const seen: Array<[number, string | undefined]> = [];
  queue.onWriteFailed((count, lastError) => seen.push([count, lastError]));
  return seen;
};

/** A field writer that always rejects the write; omit `error` for a failure with no description. */
const rejectsWith = (error?: string): WriteField =>
  vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: false, error }));

/** A field writer that always accepts the write, for tests that only exercise the reorder path. */
const acceptsWrite = (): WriteField =>
  vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));

describe("WorkItemWriteQueue - write behavior", () => {
  it("resolves with the writer's result", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 5 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const result = await queue.enqueue(req(1, 4, "Active"));

    expect(result).toEqual({ ok: true, rev: 5 });
    expect(writeField).toHaveBeenCalledWith(sent(1, 4, "Active"));
  });

  it("binds each write's rev when it runs, so a second edit to one item sees the first's new rev", async () => {
    const { logger } = createRecordingLogger();
    // Mirrors production: the tracked item owns its rev and the caller advances it on success.
    const item = { id: 1, rev: 1 };
    const writeField = vi.fn(
      async (request: WorkItemFieldWriteRequest): Promise<WorkItemFieldWriteResult> =>
        request.rev === item.rev
          ? { ok: true, rev: request.rev + 1 }
          : { ok: false, error: "stale rev" },
    );
    const queue = new WorkItemWriteQueue(writeField, logger);
    const commit = (result: WorkItemFieldWriteResult): void => {
      if (result.ok && result.rev !== undefined) {
        item.rev = result.rev;
      }
    };
    const edit = (value: string): Promise<WorkItemFieldWriteResult> => {
      const run = queue.enqueue({
        id: item.id,
        currentRev: () => item.rev,
        field: "System.State",
        value,
      });
      void run.then(commit);
      return run;
    };

    // Both edits are queued before either write runs — the double-edit window.
    const first = edit("Active");
    const second = edit("Closed");

    expect(await first).toEqual({ ok: true, rev: 2 });
    expect(await second).toEqual({ ok: true, rev: 3 });
    expect(writeField.mock.calls.map(([request]) => request.rev)).toEqual([1, 2]);
  });

  it("forwards atomic field preconditions after binding the current rev", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 6 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    await queue.enqueue({
      ...req(1, 5, "Project\\Sprint 2", "System.IterationPath"),
      preconditions: [{ field: "System.State", value: "Active" }],
    });

    expect(writeField).toHaveBeenCalledWith({
      ...sent(1, 5, "Project\\Sprint 2", "System.IterationPath"),
      preconditions: [{ field: "System.State", value: "Active" }],
    });
  });
});

describe("WorkItemWriteQueue - ordering", () => {
  it("runs writes strictly sequentially, never overlapping", async () => {
    const { logger } = createRecordingLogger();
    let active = 0;
    let maxConcurrent = 0;
    const order: number[] = [];

    const writeField = vi.fn(async (request: WorkItemFieldWriteRequest) => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      // Yield so a concurrent implementation would interleave here.
      await Promise.resolve();
      await Promise.resolve();
      order.push(request.id);
      active -= 1;
      return { ok: true, rev: request.rev + 1 };
    });

    const queue = new WorkItemWriteQueue(writeField, logger);

    await Promise.all([
      queue.enqueue(req(1, 1, "A")),
      queue.enqueue(req(2, 1, "B")),
      queue.enqueue(req(3, 1, "C")),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("keeps the chain alive after a rejected write so later writes still run", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeField = vi
      .fn<(request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, rev: 9 });

    const queue = new WorkItemWriteQueue(writeField, logger);

    const first = await queue.enqueue(req(1, 1, "A"));
    const second = await queue.enqueue(req(2, 8, "B"));

    expect(first).toEqual({ ok: false, error: "Field write threw" });
    expect(second).toEqual({ ok: true, rev: 9 });
    expect(errors).toHaveLength(1);
  });

  it("passes a cleared value (null) through to the writer", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 6 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    await queue.enqueue(req(4, 2, null, "Microsoft.VSTS.Scheduling.TargetDate"));

    expect(writeField).toHaveBeenCalledWith(
      sent(4, 2, null, "Microsoft.VSTS.Scheduling.TargetDate"),
    );
  });

  it("logs an error (without throwing) when the writer reports failure", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({
      ok: false,
      error: "stale rev",
    }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const result = await queue.enqueue(req(7, 3, "Done"));

    expect(result).toEqual({ ok: false, error: "stale rev" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toBe("stale rev");
  });

  it("logs each enqueue", async () => {
    const { logger, infos } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    await queue.enqueue(req(42, 1, "Waiting"));

    expect(infos.some((line) => line.includes("42") && line.includes("System.State"))).toBe(true);
  });
});

describe("WorkItemWriteQueue - pending count", () => {
  it("starts with a pending count of 0", () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    expect(queue.pendingCount).toBe(0);
  });

  it("notifies a new subscriber immediately with the current count", () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onPendingChange((count) => seen.push(count));

    expect(seen).toEqual([0]);
  });

  it("increments the pending count while a write is in flight and returns to 0 once it settles", async () => {
    const { logger } = createRecordingLogger();
    // A gate the test releases manually so the write can be observed mid-flight without real timers.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => {
      await gate;
      return { ok: true, rev: 3 };
    });
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onPendingChange((count) => seen.push(count));

    const run = queue.enqueue(req(1, 2, "Active"));
    // Queued but blocked on the gate: the count reflects the in-flight write.
    expect(queue.pendingCount).toBe(1);

    release();
    await run;

    expect(queue.pendingCount).toBe(0);
    expect(seen).toEqual([0, 1, 0]);
  });
});

describe("WorkItemWriteQueue - waiting for the queue to drain", () => {
  /** A writer blocked on a gate the test releases, so "in flight" is observable without timers. */
  function gatedWriter(): { writeField: WriteField; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      writeField: vi.fn(async (): Promise<WorkItemFieldWriteResult> => {
        await gate;
        return { ok: true, rev: 3 };
      }),
      release,
    };
  }

  it("resolves immediately when nothing is queued", async () => {
    const { logger } = createRecordingLogger();
    const queue = new WorkItemWriteQueue(acceptsWrite(), logger);

    await expect(queue.whenIdle()).resolves.toBeUndefined();
  });

  it("waits for an in-flight write and resolves only once the queue has drained", async () => {
    const { logger } = createRecordingLogger();
    const { writeField, release } = gatedWriter();
    const queue = new WorkItemWriteQueue(writeField, logger);

    const write = queue.enqueue(req(1, 2, "Active"));
    let drained = false;
    const idle = queue.whenIdle().then(() => {
      drained = true;
    });

    // Still blocked on the gate: a refresh that fetched now could be answered with the pre-write
    // value and would paint the user's edit as if it had been lost.
    expect(queue.pendingCount).toBe(1);
    expect(drained).toBe(false);

    release();
    await write;
    await idle;

    expect(drained).toBe(true);
    expect(queue.pendingCount).toBe(0);
  });

  it("resolves after a rejected write too, since the caller is asking whether the queue is done", async () => {
    const { logger } = createRecordingLogger();
    const queue = new WorkItemWriteQueue(rejectsWith("boom"), logger);

    const write = queue.enqueue(req(1, 2, "Active"));
    const idle = queue.whenIdle();
    await write;

    await expect(idle).resolves.toBeUndefined();
    expect(queue.failedCount).toBe(1);
  });

  it("stops listening once it has resolved, so waiting never leaks a subscription", async () => {
    const { logger } = createRecordingLogger();
    const { writeField, release } = gatedWriter();
    const queue = new WorkItemWriteQueue(writeField, logger);

    const first = queue.enqueue(req(1, 2, "Active"));
    const idle = queue.whenIdle();
    release();
    await first;
    await idle;

    // A second write must not find a stale listener still hanging off the queue; the count of live
    // subscribers is not observable, so assert the queue still behaves and settles cleanly.
    await queue.enqueue(req(1, 3, "Closed"));
    await expect(queue.whenIdle()).resolves.toBeUndefined();
    expect(queue.pendingCount).toBe(0);
  });
});

describe("WorkItemWriteQueue - listener resilience", () => {
  it("returns the pending count to 0 even when a write fails", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi
      .fn<(request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>>()
      .mockRejectedValueOnce(new Error("boom"));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onPendingChange((count) => seen.push(count));

    await queue.enqueue(req(1, 2, "Active"));

    expect(queue.pendingCount).toBe(0);
    expect(seen).toEqual([0, 1, 0]);
  });

  it("stops notifying a listener after it unsubscribes", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    const unsubscribe = queue.onPendingChange((count) => seen.push(count));
    unsubscribe();

    await queue.enqueue(req(1, 1, "Active"));

    // Only the immediate on-subscribe notification; nothing after unsubscribe.
    expect(seen).toEqual([0]);
  });

  it("isolates a throwing listener so the queue and other listeners keep working", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 9 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onPendingChange(() => {
      throw new Error("listener boom");
    });
    queue.onPendingChange((count) => seen.push(count));

    const result = await queue.enqueue(req(1, 8, "Active"));

    // The write still completes and the healthy listener still observes the full sequence.
    expect(result).toEqual({ ok: true, rev: 9 });
    expect(seen).toEqual([0, 1, 0]);
    expect(errors.some((entry) => entry.message.includes("listener"))).toBe(true);
  });
});

describe("WorkItemWriteQueue - failed count", () => {
  it("notifies a new subscriber immediately with the current failed count", () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onWriteFailed((count) => seen.push(count));

    expect(seen).toEqual([0]);
    expect(queue.failedCount).toBe(0);
  });

  it("reports a rejected write so a lost edit is distinguishable from a slow one", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({
      ok: false,
      error: "stale rev",
    }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onWriteFailed((count) => seen.push(count));

    await queue.enqueue(req(1, 1, "Active"));
    await queue.enqueue(req(1, 1, "Closed"));

    expect(seen).toEqual([0, 1, 2]);
    expect(queue.failedCount).toBe(2);
  });

  it("reports a thrown write and leaves a successful one uncounted", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi
      .fn<(request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, rev: 4 });
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onWriteFailed((count) => seen.push(count));

    await queue.enqueue(req(1, 1, "Active"));
    await queue.enqueue(req(1, 3, "Closed"));

    expect(seen).toEqual([0, 1]);
  });

  it("stops notifying a failure listener after it unsubscribes", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({
      ok: false,
      error: "nope",
    }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    const unsubscribe = queue.onWriteFailed((count) => seen.push(count));
    unsubscribe();

    await queue.enqueue(req(1, 1, "Active"));

    expect(seen).toEqual([0]);
  });

  it("isolates a throwing failure listener", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({
      ok: false,
      error: "nope",
    }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onWriteFailed(() => {
      throw new Error("listener boom");
    });
    queue.onWriteFailed((count) => seen.push(count));

    await queue.enqueue(req(1, 1, "Active"));

    expect(seen).toEqual([0, 1]);
    expect(errors.some((entry) => entry.message.includes("Failed-count listener"))).toBe(true);
  });
});

describe("WorkItemWriteQueue - reordering", () => {
  it("resolves with the reorder function's result", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const reorderItem = vi.fn(async (): Promise<WorkItemReorderResult> => ({
      ok: true,
      order: 1500,
      rev: 6,
    }));
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    const result = await queue.enqueueReorder(move(1, () => 5));

    expect(result).toEqual({ ok: true, order: 1500, rev: 6 });
    expect(reorderItem).toHaveBeenCalledWith(moveSent(1, 5));
  });

  it("binds a move's rev when it runs, so it carries the rev the write ahead of it committed", async () => {
    const { logger } = createRecordingLogger();
    // Mirrors production: the tracked item owns its rev and it advances as each write commits.
    const item = { id: 1, rev: 1 };
    const writeField = vi.fn(async (request: WorkItemFieldWriteRequest) => {
      item.rev = request.rev + 1;
      return { ok: true, rev: item.rev };
    });
    const reorderItem = vi.fn(async (): Promise<WorkItemReorderResult> => ({ ok: true }));
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    // Both are queued before either runs: the move must not freeze the rev it saw at enqueue time.
    const written = queue.enqueue(req(1, item.rev, "Active"));
    const moved = queue.enqueueReorder(move(1, () => item.rev));
    await Promise.all([written, moved]);

    expect(reorderItem).toHaveBeenCalledWith(moveSent(1, 2));
  });

  it("counts and reports a rejected move like any other failed write", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const reorderItem = vi.fn(async (): Promise<WorkItemReorderResult> => ({
      ok: false,
      error: "order HTTP 409",
    }));
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    const seen: number[] = [];
    queue.onWriteFailed((count) => seen.push(count));
    const result = await queue.enqueueReorder(move(1, () => 5));

    expect(result).toEqual({ ok: false, error: "order HTTP 409" });
    expect(seen).toEqual([0, 1]);
    expect(queue.failedCount).toBe(1);
    expect(errors[0]?.error).toBe("order HTTP 409");
  });

  it("logs 'Unknown error' when a rejected move carries no description", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const reorderItem = vi.fn(async (): Promise<WorkItemReorderResult> => ({ ok: false }));
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    await queue.enqueueReorder(move(9, () => 5));

    expect(errors[0]?.message).toBe("Move of item 9 to parent 20 failed (base rev 5)");
    expect(errors[0]?.error).toBe("Unknown error");
  });

  it("logs each queued move with the parents and neighbours it names", async () => {
    const { logger, infos } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const reorderItem = vi.fn(async (): Promise<WorkItemReorderResult> => ({ ok: true }));
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    await queue.enqueueReorder(move(42, () => 5));

    expect(infos).toEqual(["Queued move for item 42 → parent 20 (was 10), between 3 and 4"]);
  });
});

describe("WorkItemWriteQueue - reordering alongside field writes", () => {
  it("resolves ok:false when a move throws, and leaves the chain able to run the next one", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 7 }));
    const reorderItem = vi
      .fn<(request: WorkItemReorderRequest) => Promise<WorkItemReorderResult>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, order: 9 });
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    const first = await queue.enqueueReorder(move(1, () => 5));
    const second = await queue.enqueueReorder(move(2, () => 5));
    const third = await queue.enqueue(req(3, 1, "Active"));

    expect(first).toEqual({ ok: false, error: "Move threw" });
    expect(second).toEqual({ ok: true, order: 9 });
    expect(third).toEqual({ ok: true, rev: 7 });
    expect(queue.failedCount).toBe(1);
    expect(errors[0]?.message).toBe("Move of item 1 threw");
  });

  it("runs moves and field writes strictly one at a time, in the order they were queued", async () => {
    const { logger } = createRecordingLogger();
    const performed: string[] = [];
    let active = 0;
    let maxConcurrent = 0;
    // Two yields per operation, so a concurrent implementation would interleave here.
    const enter = async (label: string): Promise<void> => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      await Promise.resolve();
      await Promise.resolve();
      performed.push(label);
      active -= 1;
    };
    const writeField = vi.fn(async (request: WorkItemFieldWriteRequest) => {
      await enter(`write:${request.id}`);
      return { ok: true, rev: request.rev + 1 };
    });
    const reorderItem = vi.fn(async (request: WorkItemReorderRequest) => {
      await enter(`move:${request.id}`);
      return { ok: true };
    });
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    await Promise.all([
      queue.enqueue(req(1, 1, "A")),
      queue.enqueueReorder(move(2, () => 1)),
      queue.enqueue(req(3, 1, "C")),
      queue.enqueueReorder(move(4, () => 1)),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(performed).toEqual(["write:1", "move:2", "write:3", "move:4"]);
  });

  it("counts a queued move as pending until it settles", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    // A gate the test releases manually, so the move can be observed mid-flight without timers.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reorderItem = vi.fn(async (): Promise<WorkItemReorderResult> => {
      await gate;
      return { ok: true };
    });
    const queue = new WorkItemWriteQueue(writeField, logger, reorderItem);

    const seen: number[] = [];
    queue.onPendingChange((count) => seen.push(count));
    const run = queue.enqueueReorder(move(1, () => 5));
    expect(queue.pendingCount).toBe(1);

    release();
    await run;

    expect(queue.pendingCount).toBe(0);
    expect(seen).toEqual([0, 1, 0]);
  });

  it("reports that reordering is unavailable when the board supplied no reorder function", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const result = await queue.enqueueReorder(move(1, () => 5));

    expect(result).toEqual({ ok: false, error: "reordering is not available" });
    expect(queue.failedCount).toBe(1);
  });
});

describe("WorkItemWriteQueue - the reason the latest write failed", () => {
  it("hands the writer's own error to the failure listener", async () => {
    const { logger } = createRecordingLogger();
    const queue = new WorkItemWriteQueue(rejectsWith("stale rev"), logger);

    const seen = recordFailures(queue);
    await queue.enqueue(req(1, 1, "Active"));

    // Nothing on screen changes when a write is lost, so a bare count leaves the log as the only
    // place to find out what actually went wrong.
    expect(seen).toEqual([
      [0, undefined],
      [1, "stale rev"],
    ]);
  });

  it("hands the reorder function's own error to the failure listener", async () => {
    const { logger } = createRecordingLogger();
    const reorderItem = vi.fn(async (): Promise<WorkItemReorderResult> => ({
      ok: false,
      error: "order HTTP 409",
    }));
    const queue = new WorkItemWriteQueue(acceptsWrite(), logger, reorderItem);

    const seen = recordFailures(queue);
    await queue.enqueueReorder(move(1, () => 5));

    expect(seen).toEqual([
      [0, undefined],
      [1, "order HTTP 409"],
    ]);
  });

  it("reports 'Field write threw' when the writer throws instead of resolving", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi
      .fn<(request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>>()
      .mockRejectedValueOnce(new Error("boom"));
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen = recordFailures(queue);
    await queue.enqueue(req(1, 1, "Active"));

    expect(seen).toEqual([
      [0, undefined],
      [1, "Field write threw"],
    ]);
  });

  it("reports 'Move threw' when the reorder function throws instead of resolving", async () => {
    const { logger } = createRecordingLogger();
    const reorderItem = vi
      .fn<(request: WorkItemReorderRequest) => Promise<WorkItemReorderResult>>()
      .mockRejectedValueOnce(new Error("boom"));
    const queue = new WorkItemWriteQueue(acceptsWrite(), logger, reorderItem);

    const seen = recordFailures(queue);
    await queue.enqueueReorder(move(1, () => 5));

    expect(seen).toEqual([
      [0, undefined],
      [1, "Move threw"],
    ]);
  });

  it("reports 'Unknown error' when the rejection carries no description", async () => {
    const { logger } = createRecordingLogger();
    const queue = new WorkItemWriteQueue(rejectsWith(), logger);

    const seen = recordFailures(queue);
    await queue.enqueue(req(1, 1, "Active"));

    // A listener must always get something it can show; "" or undefined would render as nothing.
    expect(seen).toEqual([
      [0, undefined],
      [1, "Unknown error"],
    ]);
  });

  it("replaces the reason with the most recent failure rather than accumulating them", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi
      .fn<(request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>>()
      .mockResolvedValueOnce({ ok: false, error: "stale rev" })
      .mockResolvedValueOnce({ ok: false, error: "rule violation" });
    const queue = new WorkItemWriteQueue(writeField, logger);

    const seen = recordFailures(queue);
    await queue.enqueue(req(1, 1, "Active"));
    await queue.enqueue(req(1, 1, "Closed"));

    expect(seen).toEqual([
      [0, undefined],
      [1, "stale rev"],
      [2, "rule violation"],
    ]);
    expect(seen.at(-1)?.[1]).not.toContain("stale rev");
  });
});

describe("WorkItemWriteQueue - delivering the failure reason to listeners", () => {
  it("hands a brand-new subscriber the current count and the current reason", async () => {
    const { logger } = createRecordingLogger();
    const queue = new WorkItemWriteQueue(rejectsWith("stale rev"), logger);

    // Before anything has failed there is no reason to report.
    expect(recordFailures(queue)).toEqual([[0, undefined]]);

    await queue.enqueue(req(1, 1, "Active"));

    // A subscriber that arrives after the failure still learns why, without waiting for the next one.
    expect(recordFailures(queue)).toEqual([[1, "stale rev"]]);
  });

  it("isolates a throwing failure listener without withholding the reason from the others", async () => {
    const { logger, errors } = createRecordingLogger();
    const queue = new WorkItemWriteQueue(rejectsWith("stale rev"), logger);

    queue.onWriteFailed(() => {
      throw new Error("listener boom");
    });
    const seen = recordFailures(queue);
    await queue.enqueue(req(1, 1, "Active"));

    expect(seen).toEqual([
      [0, undefined],
      [1, "stale rev"],
    ]);
    expect(errors.some((entry) => entry.message.includes("Failed-count listener"))).toBe(true);
  });
});
