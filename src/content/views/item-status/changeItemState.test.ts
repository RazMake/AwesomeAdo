import { describe, expect, it, vi } from "vitest";

import type { WorkItemFieldWriteResult } from "../../../common/ado/IWorkItemFieldWriter";
import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type {
  IWorkItemStateTransitionsReader,
  WorkItemStateTransitions,
} from "../../../common/ado/WorkItemStateTransitions";
import type {
  QueuedFieldWrite,
  WorkItemWriteQueue,
} from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";

import { changeItemState } from "./changeItemState";

const PROCESS: WorkItemStateTransitions = new Map([
  ["new", ["Active"]],
  ["active", ["Resolved", "New"]],
  ["resolved", ["Closed", "Active"]],
]);

function item(state: string): TrackedWorkItem {
  return { id: 9, rev: 1, type: "Bug", state, stateChangeDate: "" } as TrackedWorkItem;
}

async function change(options: {
  state: string;
  targets: string[];
  transitions?: IWorkItemStateTransitionsReader;
  results?: WorkItemFieldWriteResult[];
}) {
  const target = item(options.state);
  const results = [...(options.results ?? [])];
  const enqueue = vi.fn((request: QueuedFieldWrite) =>
    Promise.resolve(results.shift() ?? { ok: true, rev: request.currentRev() + 1 }),
  );
  const logger = { info: vi.fn(), error: vi.fn() };
  const onAccepted = vi.fn();
  const onStopped = vi.fn();
  await changeItemState({
    item: target,
    queue: { enqueue } as unknown as WorkItemWriteQueue,
    targets: options.targets,
    transitions: options.transitions,
    logger,
    now: () => new Date("2026-10-12T00:00:00Z"),
    onAccepted,
    onStopped,
  });
  const written = enqueue.mock.calls.map(([request]) => request.value);
  return { target, written, logger, onAccepted, onStopped };
}

const reader = (transitions: WorkItemStateTransitions | null): IWorkItemStateTransitionsReader => ({
  load: () => Promise.resolve(transitions),
});

describe("changeItemState", () => {
  it("writes every hop of the shortest route, folding each revision", async () => {
    const { target, written, onAccepted, logger } = await change({
      state: "New",
      targets: ["Closed"],
      transitions: reader(PROCESS),
    });

    expect(written).toEqual(["Active", "Resolved", "Closed"]);
    expect(target).toMatchObject({ state: "Closed", rev: 4 });
    expect(onAccepted).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      'Item 9: "Bug" cannot go from "New" to "Closed" directly; writing "Active" → "Resolved" → "Closed".',
    );
  });

  it("falls back to a later state of the chosen status when the first is unreachable", async () => {
    const { written } = await change({
      state: "Active",
      targets: ["Archived", "Resolved"],
      transitions: reader(PROCESS),
    });

    expect(written).toEqual(["Resolved"]);
  });

  it("writes the first target directly when there is no map, no route, or the read throws", async () => {
    const throwing = { load: () => Promise.reject(new Error("offline")) };

    expect((await change({ state: "New", targets: ["Closed"] })).written).toEqual(["Closed"]);
    expect(
      (await change({ state: "New", targets: ["Gone"], transitions: reader(PROCESS) })).written,
    ).toEqual(["Gone"]);
    expect(
      (await change({ state: "New", targets: ["Active"], transitions: reader(null) })).written,
    ).toEqual(["Active"]);
    const failed = await change({ state: "New", targets: ["Active"], transitions: throwing });
    expect(failed.written).toEqual(["Active"]);
    expect(failed.logger.error).toHaveBeenCalledWith(
      'Could not read "Bug" state transitions',
      expect.any(Error),
    );
  });

  it("changes nothing when the first hop is refused", async () => {
    const { target, onAccepted, onStopped, logger } = await change({
      state: "New",
      targets: ["Closed"],
      transitions: reader(PROCESS),
      results: [{ ok: false, error: "HTTP 400" }],
    });

    expect(target).toMatchObject({ state: "New", rev: 1 });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onStopped).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports the intermediary state a later refused hop left behind", async () => {
    const { target, onStopped, logger } = await change({
      state: "New",
      targets: ["Closed"],
      transitions: reader(PROCESS),
      results: [{ ok: true, rev: 2 }, { ok: true }],
    });

    expect(target).toMatchObject({ state: "Active", rev: 2 });
    expect(onStopped).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      'Item 9 stopped in intermediary State "Active": writing "Resolved" on the way to "Closed" failed (no revision returned).',
    );
  });

  it("accepts without writing when the item already holds the target", async () => {
    const { written, onAccepted } = await change({
      state: "active",
      targets: ["Active"],
      transitions: reader(PROCESS),
    });

    expect(written).toEqual([]);
    expect(onAccepted).toHaveBeenCalledOnce();
  });
});
