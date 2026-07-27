import { describe, expect, it } from "vitest";

import { IMPORTANCE_FIELD } from "./adoApi";
import {
  applyRankFallback,
  buildWorkItemsBatchUrl,
  pageWorkItemIds,
  parseWorkItemRanks,
  planRankWrites,
  RANK_SPACING,
  type RankWrite,
} from "./rankFallback";

/** A rank map keyed by id, so a test states only the items that actually carry a rank. */
const ranks = (entries: Record<number, number>): Map<number, number> =>
  new Map(Object.entries(entries).map(([id, rank]) => [Number(id), rank]));

/** A `workitemsbatch` body carrying `field` for each id it names. */
const batchBody = (items: Array<{ id: number; value?: unknown }>): unknown => ({
  count: items.length,
  value: items.map(({ id, value }) => ({ id, fields: { [IMPORTANCE_FIELD]: value } })),
});

describe("buildWorkItemsBatchUrl", () => {
  it("builds the project-scoped batch endpoint for both ADO host shapes", () => {
    expect(buildWorkItemsBatchUrl("https://dev.azure.com/contoso/web/_queries/query/1")).toBe(
      "https://dev.azure.com/contoso/web/_apis/wit/workitemsbatch?api-version=7.1",
    );
    expect(buildWorkItemsBatchUrl("https://contoso.visualstudio.com/web/_queries/query/1")).toBe(
      "https://contoso.visualstudio.com/web/_apis/wit/workitemsbatch?api-version=7.1",
    );
  });

  it("returns null for a location that names no ADO project", () => {
    expect(buildWorkItemsBatchUrl("https://example.com/")).toBeNull();
  });
});

describe("pageWorkItemIds", () => {
  it("keeps a small level in a single request", () => {
    expect(pageWorkItemIds([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("splits at the batch endpoint's 200-id ceiling rather than letting the request be rejected", () => {
    const ids = Array.from({ length: 450 }, (_unused, index) => index + 1);

    const pages = pageWorkItemIds(ids);

    expect(pages.map((page) => page.length)).toEqual([200, 200, 50]);
    expect(pages.flat()).toEqual(ids);
  });

  it("asks for nothing when there are no siblings", () => {
    expect(pageWorkItemIds([])).toEqual([]);
  });
});

describe("parseWorkItemRanks", () => {
  it("reads the rank of each item the body names", () => {
    const parsed = parseWorkItemRanks(
      batchBody([
        { id: 1, value: 100 },
        { id: 2, value: 200.5 },
      ]),
      IMPORTANCE_FIELD,
    );

    expect([...parsed]).toEqual([
      [1, 100],
      [2, 200.5],
    ]);
  });

  it("accepts a bare array body as well as a { value: [...] } envelope", () => {
    const parsed = parseWorkItemRanks(
      [{ id: 1, fields: { [IMPORTANCE_FIELD]: 7 } }],
      IMPORTANCE_FIELD,
    );

    expect(parsed.get(1)).toBe(7);
  });

  it("accepts a numeric string, which some processes serialize the rank as", () => {
    expect(parseWorkItemRanks(batchBody([{ id: 1, value: "250" }]), IMPORTANCE_FIELD).get(1)).toBe(
      250,
    );
  });

  it("leaves an unranked item OUT of the map rather than calling it rank zero", () => {
    // "Not placed on the backlog yet" is the state that makes the whole fallback necessary; reading
    // it as 0 would sort those items to the top and rank later drops against a value ADO never set.
    const parsed = parseWorkItemRanks(
      batchBody([
        { id: 1, value: undefined },
        { id: 2, value: "" },
        { id: 3, value: "not a number" },
        { id: 4, value: Number.NaN },
      ]),
      IMPORTANCE_FIELD,
    );

    expect(parsed.size).toBe(0);
  });

  it("survives a body that is not a batch result at all", () => {
    expect(parseWorkItemRanks(null, IMPORTANCE_FIELD).size).toBe(0);
    expect(parseWorkItemRanks({ message: "nope" }, IMPORTANCE_FIELD).size).toBe(0);
    expect(parseWorkItemRanks([null, 7, {}], IMPORTANCE_FIELD).size).toBe(0);
  });
});

describe("planRankWrites - a single placement", () => {
  it("takes the midpoint when the neighbours leave a gap", () => {
    const plan = planRankWrites([1, 2, 3], ranks({ 1: 1000, 3: 2000 }), 2);

    expect(plan).toEqual({ writes: [{ id: 2, rank: 1500 }], reseeded: false });
  });

  it("keeps the rank whole so later drops still have room between the neighbours", () => {
    // A fractional rank sorts correctly today but halves the gap every time, until two items
    // collide and the level has to be renumbered anyway.
    const plan = planRankWrites([1, 2, 3], ranks({ 1: 1000, 3: 1003 }), 2);

    expect(plan?.writes).toEqual([{ id: 2, rank: 1001 }]);
  });

  it("steps a full spacing below the item it was dropped under", () => {
    const plan = planRankWrites([1, 2], ranks({ 1: 1000 }), 2);

    expect(plan).toEqual({ writes: [{ id: 2, rank: 1000 + RANK_SPACING }], reseeded: false });
  });

  it("steps a full spacing above the item it was dropped over when there is room", () => {
    const plan = planRankWrites([1, 2], ranks({ 2: 5 * RANK_SPACING }), 1);

    expect(plan).toEqual({ writes: [{ id: 1, rank: 4 * RANK_SPACING }], reseeded: false });
  });

  it("halves a rank too small to step a full spacing below, so the item still lands above it", () => {
    const plan = planRankWrites([1, 2], ranks({ 2: 500 }), 1);

    expect(plan?.writes).toEqual([{ id: 1, rank: 250 }]);
  });

  it("steps down from a rank of zero, which has nothing left to halve", () => {
    const plan = planRankWrites([1, 2], ranks({ 2: 0 }), 1);

    expect(plan?.writes).toEqual([{ id: 1, rank: -RANK_SPACING }]);
  });

  it("returns null when the moved item is not in the level it was ranked against", () => {
    // The caller's view of the level is stale, so any rank computed from it would be a guess.
    expect(planRankWrites([1, 2, 3], ranks({}), 99)).toBeNull();
  });
});

describe("planRankWrites - renumbering the level", () => {
  it("seeds the whole level at even spacing when nothing carries a rank", () => {
    const plan = planRankWrites([1, 2, 3], ranks({}), 2);

    expect(plan).toEqual({
      writes: [
        { id: 1, rank: RANK_SPACING },
        { id: 2, rank: 2 * RANK_SPACING },
        { id: 3, rank: 3 * RANK_SPACING },
      ],
      reseeded: true,
    });
  });

  it("renumbers when the neighbours are adjacent, since no whole rank fits between them", () => {
    const plan = planRankWrites([1, 2, 3], ranks({ 1: 1000, 3: 1001 }), 2);

    // Item 1 already sits at the renumber's base, so only the items whose rank actually changes are
    // written.
    expect(plan?.reseeded).toBe(true);
    expect(plan?.writes.map((write) => write.id)).toEqual([2, 3]);
  });

  it("anchors a renumber to the lowest rank the level already had", () => {
    // Without an anchor a renumber would yank a group sitting in the middle of the backlog straight
    // to the top of it.
    const plan = planRankWrites([1, 2], ranks({ 1: 900000, 2: 900001 }), 2);

    expect(plan?.writes).toEqual([{ id: 2, rank: 900000 + RANK_SPACING }]);
  });

  it("skips items already holding the rank the renumber would give them", () => {
    // A renumber touches items the user never dragged; every skipped write is one fewer revision on
    // somebody else's item.
    const plan = planRankWrites(
      [1, 2, 3],
      ranks({ 1: RANK_SPACING, 2: RANK_SPACING + 1, 3: 3 * RANK_SPACING }),
      2,
    );

    expect(plan?.writes).toEqual([{ id: 2, rank: 2 * RANK_SPACING }]);
  });
});

/** Records what the fallback read and wrote, so a test can assert on the calls as well as the result. */
function fakeIo(options: { bodies: unknown[]; written?: { ok: boolean; error?: string } }): {
  readRanks: (ids: readonly number[]) => Promise<unknown>;
  writeRanks: (writes: readonly RankWrite[]) => Promise<{ ok: boolean; error?: string }>;
  reads: number[][];
  writes: RankWrite[][];
} {
  const reads: number[][] = [];
  const writes: RankWrite[][] = [];
  let page = 0;
  return {
    reads,
    writes,
    readRanks: (ids) => {
      reads.push([...ids]);
      return Promise.resolve(options.bodies[page++]);
    },
    writeRanks: (plan) => {
      writes.push([...plan]);
      return Promise.resolve(options.written ?? { ok: true });
    },
  };
}

describe("applyRankFallback", () => {
  it("reads the level, writes the placement, and reports the moved item's new rank", async () => {
    const io = fakeIo({
      bodies: [
        batchBody([
          { id: 1, value: 1000 },
          { id: 2, value: 3000 },
          { id: 3, value: 5000 },
        ]),
      ],
    });

    const result = await applyRankFallback({
      siblingIds: [1, 3, 2],
      movedId: 3,
      readRanks: io.readRanks,
      writeRanks: io.writeRanks,
    });

    expect(io.reads).toEqual([[1, 3, 2]]);
    expect(io.writes).toEqual([[{ id: 3, rank: 2000 }]]);
    expect(result).toEqual({
      ok: true,
      order: 2000,
      ranks: [{ id: 3, rank: 2000 }],
      reseeded: false,
    });
  });

  it("reports every rank a renumber wrote, not just the moved item's", async () => {
    // Placing one item can renumber its whole level, and a caller that refreshed only the moved one
    // would re-sort the rest against ranks Azure DevOps no longer holds.
    const io = fakeIo({ bodies: [batchBody([{ id: 1 }, { id: 2 }])] });

    const result = await applyRankFallback({
      siblingIds: [2, 1],
      movedId: 2,
      readRanks: io.readRanks,
      writeRanks: io.writeRanks,
    });

    expect(result.ranks).toEqual([
      { id: 2, rank: RANK_SPACING },
      { id: 1, rank: 2 * RANK_SPACING },
    ]);
    expect(result.order).toBe(RANK_SPACING);
    expect(result.reseeded).toBe(true);
  });

  it("reads a level larger than one request in pages and merges them", async () => {
    const ids = Array.from({ length: 200 }, (_unused, index) => index + 1);
    const io = fakeIo({
      bodies: [
        batchBody(ids.map((id) => ({ id, value: id * 10 }))),
        batchBody([{ id: 201, value: 4000 }]),
      ],
    });

    const result = await applyRankFallback({
      siblingIds: [...ids, 201],
      movedId: 201,
      readRanks: io.readRanks,
      writeRanks: io.writeRanks,
    });

    expect(io.reads.map((page) => page.length)).toEqual([200, 1]);
    // Ranked after item 200 (rank 2000) with nothing below it, so it steps a full spacing past it.
    expect(result.order).toBe(2000 + RANK_SPACING);
  });
});

describe("applyRankFallback - nothing to do, and giving up", () => {
  it("writes nothing when the item is already at the rank the drop implies", async () => {
    const io = fakeIo({
      bodies: [
        batchBody([
          { id: 1, value: RANK_SPACING },
          { id: 2, value: 2 * RANK_SPACING },
        ]),
      ],
    });

    const result = await applyRankFallback({
      siblingIds: [1, 2],
      movedId: 2,
      readRanks: io.readRanks,
      writeRanks: io.writeRanks,
    });

    // Reporting a failure here would badge a board that is already correct as unsaved, and sending
    // the write anyway would cost a work item revision for no change.
    expect(io.writes).toEqual([]);
    expect(result).toEqual({ ok: true, order: 2 * RANK_SPACING, ranks: [], reseeded: false });
  });

  it("fails when the moved item is not among the siblings it was ranked against", async () => {
    const io = fakeIo({ bodies: [batchBody([{ id: 1, value: 10 }])] });

    const result = await applyRankFallback({
      siblingIds: [1],
      movedId: 99,
      readRanks: io.readRanks,
      writeRanks: io.writeRanks,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("99");
    expect(io.writes).toEqual([]);
  });

  it("reports the write failure rather than claiming the drop was saved", async () => {
    const io = fakeIo({
      bodies: [batchBody([{ id: 1, value: 1000 }])],
      written: { ok: false, error: "2: HTTP 403" },
    });

    const result = await applyRankFallback({
      siblingIds: [1, 2],
      movedId: 2,
      readRanks: io.readRanks,
      writeRanks: io.writeRanks,
    });

    expect(result).toEqual({ ok: false, error: "2: HTTP 403", reseeded: false });
  });
});
