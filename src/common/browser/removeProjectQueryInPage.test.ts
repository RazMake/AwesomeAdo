import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { removeProjectQueryInPage } from "./removeProjectQueryInPage";

const RELATION_URL = "https://ado.example/proj/_queries/query/11111111-2222-3333-4444-555555555555";

const CONFIG = {
  workItemUrl: "https://ado.example/_apis/wit/workitems/7?api-version=7.1",
  relationsUrl: "https://ado.example/_apis/wit/workitems/7?$expand=relations&api-version=7.1",
  rev: 4,
  relationUrl: RELATION_URL,
  linkComment: "AwesomeADO project tracking query",
  deleteQueryUrl:
    "https://ado.example/proj/_apis/wit/queries/11111111-2222-3333-4444-555555555555?api-version=7.1",
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function response(status: number, body: unknown): Response {
  return { ok: status < 300, status, json: () => Promise.resolve(body) } as unknown as Response;
}

function sequence(...answers: Response[]): ReturnType<typeof vi.fn> {
  let call = 0;
  const mock = vi.fn(() => Promise.resolve(answers[call++] ?? response(500, null)));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function callAt(mock: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  return mock.mock.calls[index] as unknown as [string, RequestInit];
}

/** The item as ADO returns it with relations expanded: one foreign link, then ours. */
function expandedItem(rev = 9): { rev: number; relations: unknown[] } {
  return {
    rev,
    relations: [
      { rel: "Hyperlink", url: "https://example.com/notes", attributes: { comment: "notes" } },
      { rel: "Hyperlink", url: RELATION_URL, attributes: { comment: CONFIG.linkComment } },
    ],
  };
}

describe("removeProjectQueryInPage", () => {
  it("locates the link at read time, removes it, then deletes the query", async () => {
    const fetchMock = sequence(
      response(200, expandedItem()),
      response(200, { rev: 10 }),
      response(204, null),
    );

    const outcome = await removeProjectQueryInPage(CONFIG);

    const [, unlinkInit] = callAt(fetchMock, 1);
    // The index comes from the read that just happened, and the URL test is what makes it safe.
    expect(JSON.parse(unlinkInit.body as string)).toEqual([
      { op: "test", path: "/rev", value: 9 },
      { op: "test", path: "/relations/1/url", value: RELATION_URL },
      { op: "remove", path: "/relations/1" },
    ]);
    expect(callAt(fetchMock, 2)[1].method).toBe("DELETE");
    expect(outcome).toEqual({ ok: true, rev: 10 });
  });

  it("matches the link's URL regardless of the casing ADO stored it in", async () => {
    const upper = {
      rev: 9,
      relations: [
        {
          rel: "Hyperlink",
          url: RELATION_URL.toUpperCase(),
          attributes: { comment: CONFIG.linkComment },
        },
      ],
    };
    const fetchMock = sequence(
      response(200, upper),
      response(200, { rev: 10 }),
      response(204, null),
    );

    expect((await removeProjectQueryInPage(CONFIG)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("deletes the query anyway when nothing links to it", async () => {
    const fetchMock = sequence(response(200, { rev: 9, relations: [] }), response(204, null));

    expect(await removeProjectQueryInPage(CONFIG)).toEqual({ ok: true, rev: undefined });
    // No unlink patch: there was no link, so a query nobody points at is still deleted.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callAt(fetchMock, 1)[1].method).toBe("DELETE");
  });

  it("leaves the query alone when the unlink is refused, so a retry starts from here", async () => {
    const fetchMock = sequence(response(200, expandedItem()), response(412, null));

    const outcome = await removeProjectQueryInPage(CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("could not unlink");
  });
});

describe("removeProjectQueryInPage outcomes", () => {
  it("treats an already-deleted query as the state the command was asked to reach", async () => {
    sequence(response(200, { rev: 9, relations: [] }), {
      ok: false,
      status: 404,
    } as unknown as Response);

    expect((await removeProjectQueryInPage(CONFIG)).ok).toBe(true);
  });

  it("says the link is gone but the query is not, so the user is not told it all worked", async () => {
    sequence(response(200, expandedItem()), response(200, { rev: 10 }), {
      ok: false,
      status: 403,
    } as unknown as Response);

    const outcome = await removeProjectQueryInPage(CONFIG);

    expect(outcome).toEqual({
      ok: false,
      rev: 10,
      error: "the query was unlinked but not deleted: HTTP 403",
    });
  });

  it("falls back to the caller's revision when the expanded read reports none", async () => {
    const fetchMock = sequence(
      response(200, { relations: expandedItem().relations }),
      response(200, { rev: 10 }),
      response(204, null),
    );

    await removeProjectQueryInPage(CONFIG);

    expect(JSON.parse(callAt(fetchMock, 1)[1].body as string)[0]).toEqual({
      op: "test",
      path: "/rev",
      value: 4,
    });
  });

  it("reports a refused read instead of deleting a query it never confirmed", async () => {
    const fetchMock = sequence({ ok: false, status: 404 } as unknown as Response);

    const outcome = await removeProjectQueryInPage(CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("could not read the project's links");
  });

  it("still deletes the query when the unlink response is not JSON", async () => {
    const brokenJson = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error("boom")),
    } as unknown as Response;
    sequence(response(200, expandedItem()), brokenJson, response(204, null));

    expect(await removeProjectQueryInPage(CONFIG)).toEqual({ ok: true, rev: undefined });
  });
});
