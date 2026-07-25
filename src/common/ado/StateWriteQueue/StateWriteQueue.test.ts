import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../logging/ILogger";
import type { WorkItemStateWriteRequest, WorkItemStateWriteResult } from "../IWorkItemStateWriter";

import { StateWriteQueue } from "./StateWriteQueue";

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

const req = (id: number, rev: number, state: string): WorkItemStateWriteRequest => ({
  id,
  rev,
  state,
});

describe("StateWriteQueue", () => {
  it("resolves with the writer's result", async () => {
    const { logger } = createRecordingLogger();
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => ({ ok: true, rev: 5 }));
    const queue = new StateWriteQueue(writeState, logger);

    const result = await queue.enqueue(req(1, 4, "Active"));

    expect(result).toEqual({ ok: true, rev: 5 });
    expect(writeState).toHaveBeenCalledWith(req(1, 4, "Active"));
  });

  it("runs writes strictly sequentially, never overlapping", async () => {
    const { logger } = createRecordingLogger();
    let active = 0;
    let maxConcurrent = 0;
    const order: number[] = [];

    const writeState = vi.fn(async (request: WorkItemStateWriteRequest) => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      // Yield so a concurrent implementation would interleave here.
      await Promise.resolve();
      await Promise.resolve();
      order.push(request.id);
      active -= 1;
      return { ok: true, rev: request.rev + 1 };
    });

    const queue = new StateWriteQueue(writeState, logger);

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
    const writeState = vi
      .fn<(request: WorkItemStateWriteRequest) => Promise<WorkItemStateWriteResult>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, rev: 9 });

    const queue = new StateWriteQueue(writeState, logger);

    const first = await queue.enqueue(req(1, 1, "A"));
    const second = await queue.enqueue(req(2, 8, "B"));

    expect(first).toEqual({ ok: false, error: "State write threw" });
    expect(second).toEqual({ ok: true, rev: 9 });
    expect(errors).toHaveLength(1);
  });

  it("logs an error (without throwing) when the writer reports failure", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => ({
      ok: false,
      error: "stale rev",
    }));
    const queue = new StateWriteQueue(writeState, logger);

    const result = await queue.enqueue(req(7, 3, "Done"));

    expect(result).toEqual({ ok: false, error: "stale rev" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toBe("stale rev");
  });

  it("logs each enqueue", async () => {
    const { logger, infos } = createRecordingLogger();
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new StateWriteQueue(writeState, logger);

    await queue.enqueue(req(42, 1, "Waiting"));

    expect(infos.some((line) => line.includes("42") && line.includes("Waiting"))).toBe(true);
  });

  it("starts with a pending count of 0", () => {
    const { logger } = createRecordingLogger();
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new StateWriteQueue(writeState, logger);

    expect(queue.pendingCount).toBe(0);
  });

  it("notifies a new subscriber immediately with the current count", () => {
    const { logger } = createRecordingLogger();
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new StateWriteQueue(writeState, logger);

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
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => {
      await gate;
      return { ok: true, rev: 3 };
    });
    const queue = new StateWriteQueue(writeState, logger);

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

  it("returns the pending count to 0 even when a write fails", async () => {
    const { logger } = createRecordingLogger();
    const writeState = vi
      .fn<(request: WorkItemStateWriteRequest) => Promise<WorkItemStateWriteResult>>()
      .mockRejectedValueOnce(new Error("boom"));
    const queue = new StateWriteQueue(writeState, logger);

    const seen: number[] = [];
    queue.onPendingChange((count) => seen.push(count));

    await queue.enqueue(req(1, 2, "Active"));

    expect(queue.pendingCount).toBe(0);
    expect(seen).toEqual([0, 1, 0]);
  });

  it("stops notifying a listener after it unsubscribes", async () => {
    const { logger } = createRecordingLogger();
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => ({ ok: true, rev: 2 }));
    const queue = new StateWriteQueue(writeState, logger);

    const seen: number[] = [];
    const unsubscribe = queue.onPendingChange((count) => seen.push(count));
    unsubscribe();

    await queue.enqueue(req(1, 1, "Active"));

    // Only the immediate on-subscribe notification; nothing after unsubscribe.
    expect(seen).toEqual([0]);
  });

  it("isolates a throwing listener so the queue and other listeners keep working", async () => {
    const { logger, errors } = createRecordingLogger();
    const writeState = vi.fn(async (): Promise<WorkItemStateWriteResult> => ({ ok: true, rev: 9 }));
    const queue = new StateWriteQueue(writeState, logger);

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
