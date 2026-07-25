import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAdoTreeInPage } from "./fetchAdoTreeInPage";

const WIQL_URL = "https://ado.example/_apis/wit/wiql/query-id";
const BATCH_URL = "https://ado.example/_apis/wit/workitemsbatch";
const QUERY_URL = "https://ado.example/_apis/wit/queries/query-id";
const FIELDS = ["System.Id", "System.Title"];
const QUERY_META = { path: "Shared Queries/Team A/Reports/Weekly" };

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

function parseBatchBody(init: RequestInit | undefined): { ids: number[]; fields: string[] } {
  return JSON.parse(init?.body as string) as { ids: number[]; fields: string[] };
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAdoTreeInPage", () => {
  it("requests the WIQL with the session credentials and hydrates deduped ids from workItemRelations", async () => {
    const wiqlBody = {
      queryType: "tree",
      workItemRelations: [
        { source: null, target: { id: 1 } },
        { source: { id: 1 }, target: { id: 2 } },
        { source: { id: 1 }, target: { id: 3 } },
      ],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url === QUERY_URL) {
        return Promise.resolve(jsonResponse(QUERY_META));
      }
      if (url === BATCH_URL) {
        const { ids } = parseBatchBody(init);
        return Promise.resolve(jsonResponse({ value: ids.map((id) => ({ id, rev: 1 })) }));
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoTreeInPage(WIQL_URL, BATCH_URL, FIELDS, QUERY_URL);

    // Credentials must be included so ADO's SameSite session cookies ride along on the page-world call.
    expect(fetchMock).toHaveBeenCalledWith(WIQL_URL, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    // The query-metadata read is same-origin and credentialed too, so the folder path resolves.
    expect(fetchMock).toHaveBeenCalledWith(QUERY_URL, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenCalledWith(BATCH_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: [1, 2, 3], fields: FIELDS }),
    });
    expect(result).toEqual({
      wiql: wiqlBody,
      items: [
        { id: 1, rev: 1 },
        { id: 2, rev: 1 },
        { id: 3, rev: 1 },
      ],
      query: QUERY_META,
    });
  });

  it("hydrates ids from workItems when the query is flat (no relations)", async () => {
    const wiqlBody = { queryType: "flat", workItems: [{ id: 5 }, { id: 7 }, { id: 5 }] };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url === QUERY_URL) {
        return Promise.resolve(jsonResponse(QUERY_META));
      }
      const { ids } = parseBatchBody(init);
      return Promise.resolve(jsonResponse({ value: ids.map((id) => ({ id })) }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoTreeInPage(WIQL_URL, BATCH_URL, FIELDS, QUERY_URL);

    expect(fetchMock).toHaveBeenCalledWith(BATCH_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: [5, 7], fields: FIELDS }),
    });
    expect(result).toEqual({ wiql: wiqlBody, items: [{ id: 5 }, { id: 7 }], query: QUERY_META });
  });

  it("pages the batch endpoint at a 200-id boundary and accumulates every page's items", async () => {
    const workItems = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
    const wiqlBody = { queryType: "flat", workItems };
    const batchIdCounts: number[] = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url === QUERY_URL) {
        return Promise.resolve(jsonResponse(QUERY_META));
      }
      const { ids } = parseBatchBody(init);
      batchIdCounts.push(ids.length);
      return Promise.resolve(jsonResponse({ value: ids.map((id) => ({ id })) }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoTreeInPage(WIQL_URL, BATCH_URL, FIELDS, QUERY_URL);

    expect(batchIdCounts).toEqual([200, 50]);
    expect(result.items).toHaveLength(250);
  });

  it("resolves to no wiql and no items when the WIQL response is not ok, without calling the batch endpoint", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(null, false)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoTreeInPage(WIQL_URL, BATCH_URL, FIELDS, QUERY_URL);

    // A not-ok query-metadata read degrades to a null folder path rather than failing the load.
    expect(result).toEqual({ wiql: null, items: [], query: null });
    // Only the WIQL and (best-effort) query-metadata reads run; the batch endpoint is never hit.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith(BATCH_URL, expect.anything());
  });

  it("resolves to no wiql and no items when the WIQL fetch rejects", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoTreeInPage(WIQL_URL, BATCH_URL, FIELDS, QUERY_URL);

    expect(result).toEqual({ wiql: null, items: [], query: null });
  });

  it("resolves with the wiql body and no items when there are zero ids to hydrate, without calling the batch endpoint", async () => {
    const wiqlBody = { queryType: "flat", workItems: [] };
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(wiqlBody)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoTreeInPage(WIQL_URL, BATCH_URL, FIELDS, QUERY_URL);

    // The single stub answers both the WIQL and query-metadata reads; the batch endpoint stays idle.
    expect(result).toEqual({ wiql: wiqlBody, items: [], query: wiqlBody });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith(BATCH_URL, expect.anything());
  });

  it("treats a non-ok batch page as an empty contribution while other pages still accumulate", async () => {
    const workItems = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
    const wiqlBody = { queryType: "flat", workItems };
    let batchCallCount = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url === QUERY_URL) {
        return Promise.resolve(jsonResponse(QUERY_META));
      }
      batchCallCount += 1;
      if (batchCallCount === 1) {
        return Promise.resolve(jsonResponse(null, false));
      }
      const { ids } = parseBatchBody(init);
      return Promise.resolve(jsonResponse({ value: ids.map((id) => ({ id })) }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoTreeInPage(WIQL_URL, BATCH_URL, FIELDS, QUERY_URL);

    expect(batchCallCount).toBe(2);
    expect(result.items).toHaveLength(50);
  });
});
