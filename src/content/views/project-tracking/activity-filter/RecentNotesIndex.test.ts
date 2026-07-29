import { describe, expect, it, vi } from "vitest";

import type {
  INoteActivityReader,
  NoteActivityRequest,
  NoteActivityResult,
} from "../../../../common/ado/INoteActivityReader";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { ILogger } from "../../../../common/logging/ILogger";

import { RecentNotesIndex } from "./RecentNotesIndex";

const NOTE_DATE = "2026-07-24T09:00:00Z";
const NOTE_AT = Date.parse(NOTE_DATE);
/** A window that opens a day before the fixture note. */
const WINDOW_START = Date.parse("2026-07-23T12:00:00Z");

/** A tracked item carrying only what the index reads: its id, its comment count, its children. */
function item(id: number, noteCount: number, children: TrackedWorkItem[] = []): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    title: `Item ${id}`,
    state: "New",
    priority: null,
    assignedTo: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    tags: [],
    noteCount,
    importance: 100,
    eta: null,
    children,
  };
}

/** A reader that answers from a callback, recording every id list it was handed. */
function fakeReader(
  answer: (request: NoteActivityRequest) => NoteActivityResult | Promise<NoteActivityResult>,
): INoteActivityReader & { asked: number[][] } {
  const asked: number[][] = [];
  return {
    asked,
    readNoteActivity: async (request) => {
      asked.push([...request.workItemIds]);
      return answer(request);
    },
  };
}

/** Dates every requested item with the fixture note. */
const datesEverything = (request: NoteActivityRequest): NoteActivityResult => ({
  activity: request.workItemIds.map((workItemId) => ({
    workItemId,
    newestNoteDate: NOTE_DATE,
  })),
  error: null,
});

/** Answers that every requested item has never been commented on. */
const datesNothing = (request: NoteActivityRequest): NoteActivityResult => ({
  activity: request.workItemIds.map((workItemId) => ({ workItemId, newestNoteDate: null })),
  error: null,
});

function fakeLogger(): ILogger & { infos: string[]; errors: string[] } {
  const infos: string[] = [];
  const errors: string[] = [];
  return { infos, errors, info: (m) => infos.push(m), error: (m) => errors.push(m) };
}

/** Drains the microtask queue the read and its completion hooks resolve on. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 50; tick++) {
    await Promise.resolve();
  }
}

describe("RecentNotesIndex — what it asks for", () => {
  it("asks about every commented item under the root, in one read", async () => {
    const reader = fakeReader(datesNothing);
    const index = new RecentNotesIndex(reader, fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 0), item(3, 4, [item(4, 1)])]));
    await settle();

    // One round-trip for the whole board, and the item ADO says has no comments is left out of it.
    expect(reader.asked).toHaveLength(1);
    expect([...(reader.asked[0] ?? [])].sort()).toEqual([3, 4]);
  });

  it("asks for nothing at all when no item under the root has a discussion", async () => {
    const reader = fakeReader(datesNothing);
    const index = new RecentNotesIndex(reader, fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 0)]));
    await settle();

    expect(reader.asked).toEqual([]);
    expect(index.isPending()).toBe(false);
  });

  it("does not start a second read while one is still in flight", async () => {
    let release!: (result: NoteActivityResult) => void;
    const reader = fakeReader(
      async () => await new Promise<NoteActivityResult>((resolve) => (release = resolve)),
    );
    const index = new RecentNotesIndex(reader, fakeLogger());
    const tree = item(1, 0, [item(2, 1)]);

    index.ensureProbed(tree);
    index.ensureProbed(tree);
    expect(reader.asked).toHaveLength(1);

    release({ activity: [], error: null });
    await settle();
  });

  it("passes the configured marker prefixes to the bulk reader", async () => {
    const requests: NoteActivityRequest[] = [];
    const reader = fakeReader((request) => {
      requests.push(request);
      return datesNothing(request);
    });
    const index = new RecentNotesIndex(reader, fakeLogger(), ["[BLOCKED]", "[ACCEPTED]"]);

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();

    expect(requests[0]?.excludedPrefixes).toEqual(["[BLOCKED]", "[ACCEPTED]"]);
  });
});

describe("RecentNotesIndex — what it records", () => {
  it("reports an item as newly commented only inside the window its newest note falls in", async () => {
    const reader = fakeReader(datesEverything);
    const index = new RecentNotesIndex(reader, fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();

    expect(index.hasRecentNote(item(2, 1), WINDOW_START)).toBe(true);
    // The recorded answer is the note's TIMESTAMP, so a later window re-tests it for free.
    expect(index.hasRecentNote(item(2, 1), NOTE_AT)).toBe(true);
    expect(index.hasRecentNote(item(2, 1), NOTE_AT + 1)).toBe(false);
    expect(reader.asked).toHaveLength(1);
  });

  it("never claims activity for an item that has no comment date", async () => {
    const index = new RecentNotesIndex(fakeReader(datesNothing), fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();

    // Even against a window that reaches back years, an item nobody has commented on never matches.
    expect(index.hasRecentNote(item(2, 1), Date.parse("2000-01-01T00:00:00Z"))).toBe(false);
  });

  it("never claims activity for an item it has not read", () => {
    const index = new RecentNotesIndex(fakeReader(datesEverything), fakeLogger());

    expect(index.hasRecentNote(item(2, 1), WINDOW_START)).toBe(false);
  });
});

describe("RecentNotesIndex — what it re-reads", () => {
  it("never re-reads a discussion whose comment count has not moved", async () => {
    const reader = fakeReader(datesEverything);
    const index = new RecentNotesIndex(reader, fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();
    // A refresh: same board, same counts, so nothing is worth another round-trip.
    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();

    expect(reader.asked).toHaveLength(1);
  });

  it("re-reads only the discussion whose comment count moved", async () => {
    const reader = fakeReader(datesEverything);
    const index = new RecentNotesIndex(reader, fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 1), item(3, 1)]));
    await settle();
    // The refreshed tree says item 3 gained a comment; item 2 is untouched.
    index.ensureProbed(item(1, 0, [item(2, 1), item(3, 2)]));
    await settle();

    expect(reader.asked[1]).toEqual([3]);
  });

  it("does not retry a failed item until its comment count moves", async () => {
    const reader = fakeReader(() => ({ activity: [], error: "sign-in (HTTP 200)" }));
    const index = new RecentNotesIndex(reader, fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();
    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();
    expect(reader.asked).toHaveLength(1);

    index.ensureProbed(item(1, 0, [item(2, 2)]));
    await settle();
    expect(reader.asked).toHaveLength(2);
  });
});

describe("RecentNotesIndex — what it reports", () => {
  it("reports itself pending until the read lands, then releases its waiters", async () => {
    let release!: (result: NoteActivityResult) => void;
    const reader = fakeReader(
      async () => await new Promise<NoteActivityResult>((resolve) => (release = resolve)),
    );
    const index = new RecentNotesIndex(reader, fakeLogger());
    const settled = vi.fn();

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    expect(index.isPending()).toBe(true);
    void index.whenSettled().then(settled);

    await settle();
    expect(settled).not.toHaveBeenCalled();

    release({ activity: [{ workItemId: 2, newestNoteDate: NOTE_DATE }], error: null });
    await settle();

    expect(index.isPending()).toBe(false);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("settles immediately when nothing is being read", async () => {
    const settled = vi.fn();
    const index = new RecentNotesIndex(fakeReader(datesNothing), fakeLogger());

    void index.whenSettled().then(settled);
    await settle();

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("logs the items a failed read lost, and never counts them as activity", async () => {
    const reader = fakeReader(() => ({ activity: [], error: "http (HTTP 403)" }));
    const logger = fakeLogger();
    const index = new RecentNotesIndex(reader, logger);

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();

    expect(index.hasRecentNote(item(2, 1), WINDOW_START)).toBe(false);
    expect(logger.errors[0]).toContain("http (HTTP 403)");
    expect(logger.infos.at(-1)).toContain("failed=1");
  });

  it("keeps the items a PARTIAL read did answer for", async () => {
    const reader = fakeReader(() => ({
      activity: [{ workItemId: 2, newestNoteDate: NOTE_DATE }],
      error: "network (HTTP 0)",
    }));
    const index = new RecentNotesIndex(reader, fakeLogger());

    index.ensureProbed(item(1, 0, [item(2, 1), item(3, 1)]));
    await settle();

    expect(index.hasRecentNote(item(2, 1), WINDOW_START)).toBe(true);
    expect(index.hasRecentNote(item(3, 1), WINDOW_START)).toBe(false);
  });

  it("logs a thrown read and never counts it as activity", async () => {
    const reader = fakeReader(() => {
      throw new Error("channel closed");
    });
    const logger = fakeLogger();
    const index = new RecentNotesIndex(reader, logger);

    index.ensureProbed(item(1, 0, [item(2, 1)]));
    await settle();

    expect(index.hasRecentNote(item(2, 1), WINDOW_START)).toBe(false);
    expect(logger.errors[0]).toContain("threw");
  });
});
