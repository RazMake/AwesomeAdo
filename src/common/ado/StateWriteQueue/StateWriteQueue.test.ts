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
});
