import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWorkItemNotesInPage } from "./fetchWorkItemNotesInPage";

const COMMENTS_URL = "https://ado.example/proj/_apis/wit/workItems/42/comments?order=desc";
const CONNECTION_URL = "https://ado.example/_apis/ConnectionData?api-version=7.1-preview.1";
const SINCE = "2026-07-10T00:00:00Z";
const CONNECTION = { authenticatedUser: { id: "guid-one" } };

/**
 * The credentialed, JSON-accepting GET every page-world read is made with. The FedAuth header is
 * what turns an expired session into a real 401 instead of a 200 carrying the HTML sign-in page.
 */
const GET_INIT = {
  credentials: "include",
  headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
};

/** A response whose body is read as text, exactly as the fetcher reads it. */
function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) } as unknown as Response;
}

/** A 200 carrying something that is not JSON — how ADO answers an expired session. */
function signInPageResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve("<html>Sign in</html>"),
  } as unknown as Response;
}

/** One comments page: entries dated `dates`, plus an optional continuation token. */
function page(dates: string[], continuationToken?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    comments: dates.map((createdDate, index) => ({ id: index + 1, createdDate })),
  };
  if (continuationToken !== undefined) {
    body.continuationToken = continuationToken;
  }
  return body;
}

/** A fetch that answers the connection URL with `CONNECTION` and every comments URL from `pages`. */
function fetchServing(pages: unknown[]): ReturnType<typeof vi.fn> {
  let served = 0;
  return vi.fn((url: string) => {
    if (url === CONNECTION_URL) {
      return Promise.resolve(jsonResponse(CONNECTION));
    }
    const body = pages[served] ?? {};
    served += 1;
    return Promise.resolve(jsonResponse(body));
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchWorkItemNotesInPage — reading one page", () => {
  it("reads the discussion and the signed-in identity with the page's own session", async () => {
    const fetchMock = fetchServing([page(["2026-07-20T00:00:00Z"])]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    // Credentials must ride along, or ADO answers the sign-in page instead of the discussion.
    expect(fetchMock).toHaveBeenCalledWith(COMMENTS_URL, GET_INIT);
    expect(fetchMock).toHaveBeenCalledWith(CONNECTION_URL, GET_INIT);
    expect(raw.pages).toEqual([page(["2026-07-20T00:00:00Z"])]);
    expect(raw.connection).toEqual(CONNECTION);
    expect(raw.connectionFailure).toBe("none");
    expect(raw.connectionStatus).toBe(200);
  });

  it("stops after one page when ADO offered no continuation token", async () => {
    const fetchMock = fetchServing([page(["2026-07-20T00:00:00Z"])]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.pages).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchWorkItemNotesInPage — paging", () => {
  it("follows the continuation token, encoded onto the same comments URL", async () => {
    const first = page(["2026-07-20T00:00:00Z"], "tok en/1");
    const fetchMock = fetchServing([first, page(["2026-07-15T00:00:00Z"])]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(fetchMock).toHaveBeenCalledWith(
      `${COMMENTS_URL}&continuationToken=tok%20en%2F1`,
      GET_INIT,
    );
    expect(raw.pages).toHaveLength(2);
  });

  it("stops once a page reaches past the window, since the rest is older still", async () => {
    const first = page(["2026-07-20T00:00:00Z", "2026-06-01T00:00:00Z"], "t1");
    const fetchMock = fetchServing([first, page(["2026-05-01T00:00:00Z"])]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.pages).toEqual([first]);
  });

  it("keeps paging when a page's dates are unreadable, since they say nothing about how far back it reached", async () => {
    const first = page(["whenever"], "t1");
    const fetchMock = fetchServing([first, page(["2026-07-15T00:00:00Z"])]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.pages).toHaveLength(2);
  });

  it("stops at maxPages even when the server keeps offering a token", async () => {
    const endless = page(["2026-07-20T00:00:00Z"], "t1");
    const fetchMock = fetchServing([endless, endless, endless, endless]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 2);

    expect(raw.pages).toHaveLength(2);
  });

  it("stops when a page carries no comments array at all", async () => {
    const first = { count: 0, continuationToken: "t1" };
    const fetchMock = fetchServing([first, page(["2026-07-15T00:00:00Z"])]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.pages).toEqual([first]);
  });
});

describe("fetchWorkItemNotesInPage — failure handling", () => {
  it("reports the rejected status rather than an empty discussion when the read fails", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(null, false, 403)),
    ) as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw).toEqual({
      pages: [],
      connection: null,
      status: 403,
      failure: "http",
      connectionStatus: 403,
      connectionFailure: "http",
    });
  });

  it("names an expired session, which ADO answers with a 200 and its sign-in page", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(signInPageResponse()),
    ) as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.failure).toBe("sign-in");
    expect(raw.pages).toEqual([]);
  });

  it("degrades rather than throwing when the request is rejected outright", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw).toEqual({
      pages: [],
      connection: null,
      status: 0,
      failure: "network",
      connectionStatus: 0,
      connectionFailure: "network",
    });
  });

  it("reports a rejected IDENTITY read without failing the notes it did read", async () => {
    // The exact shape of the live bug this pair of fields exists for: ADO rejected ConnectionData
    // while serving the discussion happily. Without a reported outcome the caller saw only a null
    // body, which is indistinguishable from "nobody is signed in".
    globalThis.fetch = vi.fn((url: string) =>
      Promise.resolve(
        url === CONNECTION_URL
          ? jsonResponse({ typeKey: "VssInvalidPreviewVersionException" }, false, 400)
          : jsonResponse(page(["2026-07-20T00:00:00Z"])),
      ),
    ) as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.failure).toBe("none");
    expect(raw.pages).toHaveLength(1);
    expect(raw.connection).toBeNull();
    expect(raw.connectionFailure).toBe("http");
    expect(raw.connectionStatus).toBe(400);
  });

  it("keeps the pages it already read when a LATER page fails, since a partial discussion beats none", async () => {
    let served = 0;
    globalThis.fetch = vi.fn((url: string) => {
      if (url === CONNECTION_URL) {
        return Promise.resolve(jsonResponse(CONNECTION));
      }
      served += 1;
      return served === 1
        ? Promise.resolve(jsonResponse(page(["2026-07-20T00:00:00Z"], "t1")))
        : Promise.resolve(jsonResponse(null, false, 500));
    }) as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.pages).toHaveLength(1);
    expect(raw.failure).toBe("none");
  });

  it("still returns the notes when only the identity read fails", async () => {
    const fetchMock = vi.fn((url: string) =>
      url === CONNECTION_URL
        ? Promise.resolve(jsonResponse(null, false, 401))
        : Promise.resolve(jsonResponse(page(["2026-07-20T00:00:00Z"]))),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const raw = await fetchWorkItemNotesInPage(COMMENTS_URL, CONNECTION_URL, SINCE, 5);

    expect(raw.pages).toHaveLength(1);
    expect(raw.connection).toBeNull();
    expect(raw.failure).toBe("none");
  });
});
