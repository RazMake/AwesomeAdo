import { afterEach, describe, expect, it, vi } from "vitest";

import { writeWorkItemRanksInPage } from "./writeWorkItemRanksInPage";

const FIELD = "Microsoft.VSTS.Common.StackRank";
const url = (id: number): string => `https://ado.example/contoso/_apis/wit/workitems/${id}`;

/** A minimal `Response` stand-in: only `ok`, `status` and `text()` are ever read. */
const reply = (ok: boolean, status = 200, text = ""): Response =>
  ({ ok, status, text: () => Promise.resolve(text) }) as unknown as Response;

/** A 200 that also describes the updated item back, the way Azure DevOps really answers a patch. */
const replyWithRev = (rev: number): Response =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(""),
    json: () => Promise.resolve({ rev }),
  }) as unknown as Response;

type Call = [string, RequestInit | undefined];

/** Stubs `fetch` with a per-URL outcome, recording the calls in the order they were made. */
function stubFetch(outcomes: Record<string, Response>): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (target: string, init?: RequestInit) => {
    calls.push([target, init]);
    return Promise.resolve(outcomes[target] ?? reply(true));
  });
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writeWorkItemRanksInPage", () => {
  it("patches each item's rank field as a JSON Patch document with the page's session", async () => {
    const { calls } = stubFetch({});

    const result = await writeWorkItemRanksInPage({
      field: FIELD,
      writes: [{ id: 1, url: url(1), rank: 1500 }],
    });

    const [target, init] = calls[0]!;
    expect(target).toBe(url(1));
    expect(init?.method).toBe("PATCH");
    // ADO's session cookies are SameSite, so the page-world call must send credentials.
    expect(init?.credentials).toBe("include");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json-patch+json",
    );
    // The rank is written as a NUMBER: ADO stores the backlog rank as a numeric field, and a string
    // would either be rejected or stored as text that then sorts alphabetically.
    expect(JSON.parse(init?.body as string)).toEqual([
      { op: "add", path: `/fields/${FIELD}`, value: 1500 },
    ]);
    expect(result).toEqual({ ok: true, written: [1], revs: [], error: undefined });
  });

  // A rank write is a revision like any other. Reporting it is what stops every item a renumber
  // touched from failing its NEXT edit with HTTP 412.
  it("reports the revision each write produced", async () => {
    stubFetch({ [url(1)]: replyWithRev(12), [url(2)]: replyWithRev(4) });

    const result = await writeWorkItemRanksInPage({
      field: FIELD,
      writes: [
        { id: 1, url: url(1), rank: 100 },
        { id: 2, url: url(2), rank: 200 },
      ],
    });

    expect(result.revs).toEqual([
      { id: 1, rev: 12 },
      { id: 2, rev: 4 },
    ]);
  });

  it("still counts a write whose body says nothing about the revision", async () => {
    // The rank IS written by then; losing the rev must never report a landed write as failed.
    stubFetch({ [url(1)]: replyWithRev(NaN) });

    const result = await writeWorkItemRanksInPage({
      field: FIELD,
      writes: [{ id: 1, url: url(1), rank: 100 }],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toEqual([1]);
    expect(result.revs).toEqual([]);
  });

  it("sends no rev test, unlike every other patch the extension makes", async () => {
    const { calls } = stubFetch({});

    await writeWorkItemRanksInPage({ field: FIELD, writes: [{ id: 1, url: url(1), rank: 10 }] });

    // A rank is a position this operation just computed, not a value a person authored: guarding it
    // on a revision would reject the write whenever anyone had touched an unrelated field, and in a
    // renumber that would leave the level half-ranked.
    const ops = JSON.parse(calls[0]![1]?.body as string) as Array<Record<string, unknown>>;
    expect(ops.some((op) => op.op === "test")).toBe(false);
  });

  it("writes one item after another so a failure names the item it belongs to", async () => {
    const { calls } = stubFetch({ [url(2)]: reply(false, 403, "no permission") });

    const result = await writeWorkItemRanksInPage({
      field: FIELD,
      writes: [
        { id: 1, url: url(1), rank: 100 },
        { id: 2, url: url(2), rank: 200 },
        { id: 3, url: url(3), rank: 300 },
      ],
    });

    expect(calls.map(([target]) => target)).toEqual([url(1), url(2), url(3)]);
    // A partial failure still says what DID change, so the caller is not left guessing whether the
    // level was renumbered or untouched.
    expect(result.ok).toBe(false);
    expect(result.written).toEqual([1, 3]);
    expect(result.error).toBe("2: HTTP 403: no permission");
  });
});

describe("writeWorkItemRanksInPage - failures", () => {
  it("still names the failing item when its error body cannot be read", async () => {
    stubFetch({
      [url(1)]: {
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error("stream closed")),
      } as unknown as Response,
    });

    const result = await writeWorkItemRanksInPage({
      field: FIELD,
      writes: [{ id: 1, url: url(1), rank: 100 }],
    });

    expect(result).toEqual({ ok: false, written: [], revs: [], error: "1: HTTP 500" });
  });

  it("truncates a long error body so one failure cannot flood a bounded log", async () => {
    stubFetch({ [url(1)]: reply(false, 500, "x".repeat(1000)) });

    const result = await writeWorkItemRanksInPage({
      field: FIELD,
      writes: [{ id: 1, url: url(1), rank: 100 }],
    });

    expect(result.error).toHaveLength("1: HTTP 500: ".length + 200);
  });

  it("succeeds without a request when there is nothing to write", async () => {
    const { calls } = stubFetch({});

    expect(await writeWorkItemRanksInPage({ field: FIELD, writes: [] })).toEqual({
      ok: true,
      written: [],
      revs: [],
      error: undefined,
    });
    expect(calls).toEqual([]);
  });

  it("resolves with a failure rather than throwing when the fetch itself rejects", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));

    const result = await writeWorkItemRanksInPage({
      field: FIELD,
      writes: [{ id: 1, url: url(1), rank: 100 }],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });
});
