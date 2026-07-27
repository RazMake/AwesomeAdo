import { describe, expect, it, vi } from "vitest";

import type {
  IWorkItemNoteLoader,
  WorkItemNotesRequest,
  WorkItemNotesResult,
} from "../../../../common/ado/IWorkItemNoteLoader";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { WorkItemNote } from "../../../../common/ado/WorkItemNote";
import type { ILogger } from "../../../../common/logging/ILogger";

import { RecentNotesIndex } from "./RecentNotesIndex";

const SINCE = "2026-07-23T12:00:00Z";

/** A tracked item carrying only what the index reads: its id, its comment count, its children. */
function item(id: number, noteCount: number, children: TrackedWorkItem[] = []): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    title: `Item ${id}`,
    state: "New",
    assignedTo: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    noteCount,
    importance: 100,
    eta: null,
    children,
  };
}

/** One note; only its presence matters, so every field is a placeholder. */
const someNote: WorkItemNote = {
  id: 1,
  workItemId: 0,
  author: { displayName: "Someone", id: null, uniqueName: null },
  createdDate: "2026-07-24T09:00:00Z",
  text: "hi",
  renderedHtml: null,
};

/** A loader that answers from a per-item map, recording every request it was handed. */
function fakeLoader(
  answer: (request: WorkItemNotesRequest) => WorkItemNotesResult | Promise<WorkItemNotesResult>,
): IWorkItemNoteLoader & { requests: WorkItemNotesRequest[] } {
  const requests: WorkItemNotesRequest[] = [];
  return {
    requests,
    loadNotes: async (request) => {
      requests.push(request);
      return answer(request);
    },
  };
}

function fakeLogger(): ILogger & { infos: string[]; errors: string[] } {
  const infos: string[] = [];
  const errors: string[] = [];
  return { infos, errors, info: (m) => infos.push(m), error: (m) => errors.push(m) };
}

/** Drains the microtask queue the reads and their completion hooks resolve on. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 50; tick++) {
    await Promise.resolve();
  }
}

const EMPTY: WorkItemNotesResult = { notes: [], currentUser: null, error: null };

describe("RecentNotesIndex — what it reads", () => {
  it("reads only the discussions ADO says exist", async () => {
    const loader = fakeLoader(() => EMPTY);
    const index = new RecentNotesIndex(loader, fakeLogger(), () => {});

    index.ensureProbed(item(1, 0, [item(2, 0), item(3, 4, [item(4, 1)])]), SINCE);
    await settle();

    expect(loader.requests.map((request) => request.workItemId).sort()).toEqual([3, 4]);
    expect(loader.requests[0]?.sinceIso).toBe(SINCE);
  });

  it("records only the items whose discussion carried a note inside the window", async () => {
    const loader = fakeLoader((request) =>
      request.workItemId === 2 ? { ...EMPTY, notes: [someNote] } : EMPTY,
    );
    const index = new RecentNotesIndex(loader, fakeLogger(), () => {});
    const tree = item(1, 0, [item(2, 1), item(3, 1)]);

    index.ensureProbed(tree, SINCE);
    await settle();

    expect(index.hasRecentNote(item(2, 1))).toBe(true);
    expect(index.hasRecentNote(item(3, 1))).toBe(false);
  });

  it("never reads the same discussion twice, and keeps the window it first probed with", async () => {
    const loader = fakeLoader(() => EMPTY);
    const index = new RecentNotesIndex(loader, fakeLogger(), () => {});
    const tree = item(1, 0, [item(2, 1)]);

    index.ensureProbed(tree, SINCE);
    await settle();
    index.ensureProbed(tree, "2026-07-24T00:00:00Z");
    await settle();

    expect(loader.requests.length).toBe(1);
  });

  it("pins later reads to the window the first probe opened", async () => {
    const loader = fakeLoader(() => EMPTY);
    const index = new RecentNotesIndex(loader, fakeLogger(), () => {});
    const tree = item(1, 0, [item(2, 1)]);

    index.ensureProbed(tree, SINCE);
    await settle();
    tree.children.push(item(5, 1));
    index.ensureProbed(tree, "2026-07-24T00:00:00Z");
    await settle();

    expect(loader.requests.map((request) => request.sinceIso)).toEqual([SINCE, SINCE]);
  });

  it("never has more than six discussions in flight at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const loader = fakeLoader(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => release.push(resolve));
      inFlight--;
      return EMPTY;
    });
    const index = new RecentNotesIndex(loader, fakeLogger(), () => {});
    const children = Array.from({ length: 15 }, (_, offset) => item(offset + 2, 1));

    index.ensureProbed(item(1, 0, children), SINCE);
    await settle();
    expect(peak).toBe(6);

    while (release.length > 0) {
      release.shift()?.();
      await settle();
    }

    expect(loader.requests.length).toBe(15);
    expect(peak).toBe(6);
  });
});

describe("RecentNotesIndex — what it reports", () => {
  it("reports itself pending until every read lands, then settles exactly once", async () => {
    const pending: (() => void)[] = [];
    const loader = fakeLoader(
      async () =>
        await new Promise<WorkItemNotesResult>((resolve) => {
          pending.push(() => resolve(EMPTY));
        }),
    );
    const onSettled = vi.fn();
    const index = new RecentNotesIndex(loader, fakeLogger(), onSettled);

    index.ensureProbed(item(1, 0, [item(2, 1), item(3, 1)]), SINCE);
    expect(index.isPending()).toBe(true);

    pending[0]?.();
    await settle();
    expect(index.isPending()).toBe(true);
    expect(onSettled).not.toHaveBeenCalled();

    pending[1]?.();
    await settle();
    expect(index.isPending()).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no discussion left to read", async () => {
    const loader = fakeLoader(() => EMPTY);
    const onSettled = vi.fn();
    const index = new RecentNotesIndex(loader, fakeLogger(), onSettled);

    index.ensureProbed(item(1, 0, [item(2, 0)]), SINCE);
    await settle();

    expect(loader.requests).toEqual([]);
    expect(index.isPending()).toBe(false);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("logs a failed read and never counts it as activity", async () => {
    const loader = fakeLoader(() => ({ ...EMPTY, error: "403 Forbidden" }));
    const logger = fakeLogger();
    const index = new RecentNotesIndex(loader, logger, () => {});

    index.ensureProbed(item(1, 0, [item(2, 1)]), SINCE);
    await settle();

    expect(index.hasRecentNote(item(2, 1))).toBe(false);
    expect(logger.errors[0]).toContain("403 Forbidden");
    expect(logger.infos.at(-1)).toContain("failed=1");
  });

  it("logs a thrown read and never counts it as activity", async () => {
    const loader = fakeLoader(() => {
      throw new Error("channel closed");
    });
    const logger = fakeLogger();
    const index = new RecentNotesIndex(loader, logger, () => {});

    index.ensureProbed(item(1, 0, [item(2, 1)]), SINCE);
    await settle();

    expect(index.hasRecentNote(item(2, 1))).toBe(false);
    expect(logger.errors[0]).toContain("threw");
  });
});
