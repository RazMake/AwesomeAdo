import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProjectQueryInPage } from "./createProjectQueryInPage";

const CONFIG = {
  createQueryUrl: "https://ado.example/proj/_apis/wit/queries/Shared%20Queries?api-version=7.1",
  wiql: "SELECT [System.Id] FROM WorkItemLinks",
  names: ["Payments", "Payments (#7)"],
  webUrlPrefix: "https://ado.example/proj/_queries/query/",
  deleteUrlPrefix: "https://ado.example/proj/_apis/wit/queries/",
  deleteUrlSuffix: "?api-version=7.1",
  workItemUrl: "https://ado.example/_apis/wit/workitems/7?api-version=7.1",
  rev: 4,
  relationType: "Hyperlink",
  linkComment: "AwesomeADO project tracking query",
};

const QUERY_ID = "11111111-2222-3333-4444-555555555555";

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

/** A fetch double that answers each call in turn, recording what it was asked. */
function sequence(...answers: Response[]): ReturnType<typeof vi.fn> {
  let call = 0;
  const mock = vi.fn(() => Promise.resolve(answers[call++] ?? response(500, null)));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function callAt(mock: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  return mock.mock.calls[index] as unknown as [string, RequestInit];
}

describe("createProjectQueryInPage", () => {
  it("creates the query, then hangs it off the project as a stamped hyperlink", async () => {
    const fetchMock = sequence(response(200, { id: QUERY_ID }), response(200, { rev: 5 }));

    const outcome = await createProjectQueryInPage(CONFIG);

    const [createUrl, createInit] = callAt(fetchMock, 0);
    expect(createUrl).toBe(CONFIG.createQueryUrl);
    expect(JSON.parse(createInit.body as string)).toEqual({
      name: "Payments",
      wiql: CONFIG.wiql,
    });

    const [linkUrl, linkInit] = callAt(fetchMock, 1);
    expect(linkUrl).toBe(CONFIG.workItemUrl);
    expect(linkInit.method).toBe("PATCH");
    expect(JSON.parse(linkInit.body as string)).toEqual([
      { op: "test", path: "/rev", value: 4 },
      {
        op: "add",
        path: "/relations/-",
        value: {
          rel: "Hyperlink",
          url: `${CONFIG.webUrlPrefix}${QUERY_ID}`,
          attributes: { comment: CONFIG.linkComment },
        },
      },
    ]);
    expect(outcome).toEqual({ ok: true, queryId: QUERY_ID, rev: 5 });
  });

  it("retries under the distinguishing name when the first one is already taken", async () => {
    const fetchMock = sequence(
      response(400, { message: "already exists" }),
      response(200, { id: QUERY_ID }),
      response(200, { rev: 5 }),
    );

    const outcome = await createProjectQueryInPage(CONFIG);

    expect(JSON.parse(callAt(fetchMock, 1)[1].body as string)).toMatchObject({
      name: "Payments (#7)",
    });
    expect(outcome.ok).toBe(true);
  });

  it("gives up once every candidate name is taken, rather than looping", async () => {
    sequence(response(400, null), response(400, null));

    const outcome = await createProjectQueryInPage(CONFIG);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("already taken");
  });

  it("reports a create failure that is not a name clash without trying another name", async () => {
    const fetchMock = sequence(response(403, null));

    expect(await createProjectQueryInPage(CONFIG)).toEqual({ ok: false, error: "HTTP 403" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createProjectQueryInPage failures", () => {
  it("deletes the query it just created when the link cannot be written", async () => {
    const fetchMock = sequence(
      response(200, { id: QUERY_ID }),
      response(412, null),
      response(204, null),
    );

    const outcome = await createProjectQueryInPage(CONFIG);

    // Without the rollback the query would sit in a shared folder with nothing pointing at it.
    const [rollbackUrl, rollbackInit] = callAt(fetchMock, 2);
    expect(rollbackUrl).toBe(`${CONFIG.deleteUrlPrefix}${QUERY_ID}${CONFIG.deleteUrlSuffix}`);
    expect(rollbackInit.method).toBe("DELETE");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("412");
  });

  it("still reports the link failure when the rollback itself fails", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(() => {
      call += 1;
      if (call === 1) return Promise.resolve(response(200, { id: QUERY_ID }));
      if (call === 2) return Promise.resolve(response(412, null));
      return Promise.reject(new Error("offline"));
    }) as unknown as typeof fetch;

    const outcome = await createProjectQueryInPage(CONFIG);

    expect(outcome.error).toContain("could not link the query");
  });

  it("reports a network failure as the outcome rather than rejecting", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const outcome = await createProjectQueryInPage(CONFIG);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("offline");
  });
});
