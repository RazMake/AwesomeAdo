import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../logging/ILogger";
import type { WorkItemFieldWriteRequest, WorkItemFieldWriteResult } from "../IWorkItemFieldWriter";

import { FieldWriteQueue, type QueuedFieldWrite } from "./FieldWriteQueue";

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

describe("FieldWriteQueue - write behavior", () => {
  it("resolves with the writer's result", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 5 }));
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);
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
});

describe("FieldWriteQueue - ordering", () => {
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

    const queue = new FieldWriteQueue(writeField, logger);

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

    const queue = new FieldWriteQueue(writeField, logger);

    const first = await queue.enqueue(req(1, 1, "A"));
    const second = await queue.enqueue(req(2, 8, "B"));

    expect(first).toEqual({ ok: false, error: "Field write threw" });
    expect(second).toEqual({ ok: true, rev: 9 });
    expect(errors).toHaveLength(1);
  });

  it("passes a cleared value (null) through to the writer", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 6 }));
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);

    const result = await queue.enqueue(req(7, 3, "Done"));

    expect(result).toEqual({ ok: false, error: "stale rev" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toBe("stale rev");
  });

  it("logs each enqueue", async () => {
    const { logger, infos } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new FieldWriteQueue(writeField, logger);

    await queue.enqueue(req(42, 1, "Waiting"));

    expect(infos.some((line) => line.includes("42") && line.includes("System.State"))).toBe(true);
  });
});

describe("FieldWriteQueue - pending count", () => {
  it("starts with a pending count of 0", () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new FieldWriteQueue(writeField, logger);

    expect(queue.pendingCount).toBe(0);
  });

  it("notifies a new subscriber immediately with the current count", () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);

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

describe("FieldWriteQueue - listener resilience", () => {
  it("returns the pending count to 0 even when a write fails", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi
      .fn<(request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>>()
      .mockRejectedValueOnce(new Error("boom"));
    const queue = new FieldWriteQueue(writeField, logger);

    const seen: number[] = [];
    queue.onPendingChange((count) => seen.push(count));

    await queue.enqueue(req(1, 2, "Active"));

    expect(queue.pendingCount).toBe(0);
    expect(seen).toEqual([0, 1, 0]);
  });

  it("stops notifying a listener after it unsubscribes", async () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);

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

describe("FieldWriteQueue - failed count", () => {
  it("notifies a new subscriber immediately with the current failed count", () => {
    const { logger } = createRecordingLogger();
    const writeField = vi.fn(async (): Promise<WorkItemFieldWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);

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
    const queue = new FieldWriteQueue(writeField, logger);

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
