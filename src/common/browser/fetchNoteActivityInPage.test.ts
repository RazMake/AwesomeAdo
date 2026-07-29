import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchNoteActivityInPage } from "./fetchNoteActivityInPage";

/**
 * The credentialed, JSON-accepting GET every page-world read is made with. The FedAuth header is
 * what turns an expired session into a real 401 instead of a 200 carrying the HTML sign-in page.
 */
const GET_INIT = {
  credentials: "include",
  headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
};

/** Requests for `count` items, addressed the way the worker builds them. */
function requestsFor(count: number): { workItemId: number; url: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    workItemId: index + 1,
    url: `https://ado.example/proj/_apis/wit/workItems/${index + 1}/comments?$top=1`,
  }));
}

/** The single serializable config object passed through executeScript. */
function configFor(
  count: number,
  overrides: Partial<Parameters<typeof fetchNoteActivityInPage>[0]> = {},
): Parameters<typeof fetchNoteActivityInPage>[0] {
  return {
    requests: requestsFor(count),
    concurrency: 6,
    excludedPrefixes: [],
    maxPages: 10,
    ...overrides,
  };
}

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

const dated = (createdDate: string): Response => jsonResponse({ comments: [{ createdDate }] });

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchNoteActivityInPage — what it reads", () => {
  it("reads every item in one call and reports each newest date", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(dated(url.includes("/1/") ? "2026-07-24T09:00:00Z" : "2026-01-01T00:00:00Z")),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(2));

    expect(result.newest).toEqual([
      { workItemId: 1, newestNoteDate: "2026-07-24T09:00:00Z" },
      { workItemId: 2, newestNoteDate: "2026-01-01T00:00:00Z" },
    ]);
    expect(result.failure).toBe("none");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/1/"), GET_INIT);
  });

  it("reports an item with no comments as dateless rather than failed", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ comments: [] })),
    ) as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(1));

    expect(result.newest).toEqual([{ workItemId: 1, newestNoteDate: null }]);
    expect(result.failedIds).toEqual([]);
  });

  it("does nothing at all when there is nothing to read", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(0));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ newest: [], failedIds: [], failure: "none", status: 0 });
  });

  it("never has more than the requested number of reads in flight at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    globalThis.fetch = vi.fn(() => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise<Response>((resolve) => {
        release.push(() => {
          inFlight -= 1;
          resolve(jsonResponse({ comments: [] }));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    const pending = fetchNoteActivityInPage(configFor(10, { concurrency: 3 }));
    await Promise.resolve();
    expect(peak).toBe(3);

    while (release.length > 0) {
      release.shift()?.();
      // Each release lets the pool start the next read.
      for (let tick = 0; tick < 5; tick++) {
        await Promise.resolve();
      }
    }

    const result = await pending;
    expect(result.newest).toHaveLength(10);
    expect(peak).toBe(3);
  });
});

describe("fetchNoteActivityInPage — marker-comment paging", () => {
  it("skips marker-prefixed comments and keeps paging to the newest ordinary note", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          comments: [{ text: "[BLOCKED] Waiting", createdDate: "2026-07-24T09:00:00Z" }],
          continuationToken: "next page",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          comments: [{ text: "Planning update", createdDate: "2026-07-23T09:00:00Z" }],
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(1, { excludedPrefixes: ["[BLOCKED]"] }));

    expect(result.newest).toEqual([{ workItemId: 1, newestNoteDate: "2026-07-23T09:00:00Z" }]);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("continuationToken=next%20page");
  });

  it("reports an incomplete answer when the page guard is reached", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          comments: [{ text: "[BLOCKED] Waiting", createdDate: "2026-07-24T09:00:00Z" }],
          continuationToken: "more",
        }),
      ),
    ) as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(
      configFor(1, { excludedPrefixes: ["[BLOCKED]"], maxPages: 1 }),
    );

    expect(result.newest).toEqual([]);
    expect(result.failedIds).toEqual([1]);
    expect(result.failure).toBe("limit");
  });
});

describe("fetchNoteActivityInPage — what it does when a read fails", () => {
  it("keeps the items that were read when one of them fails", async () => {
    globalThis.fetch = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("/1/") ? jsonResponse(null, false, 403) : dated("2026-07-24T09:00:00Z"),
      ),
    ) as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(2));

    // A partial answer still narrows the board correctly; the lost item is simply never claimed.
    expect(result.newest).toEqual([{ workItemId: 2, newestNoteDate: "2026-07-24T09:00:00Z" }]);
    expect(result.failedIds).toEqual([1]);
    expect(result.failure).toBe("http");
    expect(result.status).toBe(403);
  });

  it("classifies a 200 that is not JSON as a lost session, not an empty discussion", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(signInPageResponse()),
    ) as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(1));

    expect(result.failure).toBe("sign-in");
    expect(result.newest).toEqual([]);
  });

  it("classifies a request that never completed as a network failure", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error("offline")),
    ) as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(1));

    expect(result.failure).toBe("network");
    expect(result.status).toBe(0);
    expect(result.failedIds).toEqual([1]);
  });

  it("keeps only the FIRST failure, so one lost session is not reported once per item", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(() => {
      call += 1;
      return Promise.resolve(call === 1 ? jsonResponse(null, false, 401) : signInPageResponse());
    }) as unknown as typeof globalThis.fetch;

    const result = await fetchNoteActivityInPage(configFor(2, { concurrency: 1 }));

    expect(result.failure).toBe("http");
    expect(result.status).toBe(401);
    expect(result.failedIds).toEqual([1, 2]);
  });
});
