import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readProjectQueryLinksInPage } from "./readProjectQueryLinksInPage";

const BATCH_URL = "https://ado.example/proj/_apis/wit/workitemsbatch?api-version=7.1";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

describe("readProjectQueryLinksInPage", () => {
  it("asks for the items expanded with their relations, using the signed-in session", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok({ value: [{ id: 1 }] })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await readProjectQueryLinksInPage({ batchUrl: BATCH_URL, ids: [1] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(BATCH_URL);
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ ids: [1], $expand: "Relations" });
    expect(outcome).toEqual({ ok: true, raw: { value: [{ id: 1 }] } });
  });

  it("pages past ADO's 200-id cap and concatenates every page", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => index + 1);
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { ids: number[] };
      return Promise.resolve(ok({ value: body.ids.map((id) => ({ id })) }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await readProjectQueryLinksInPage({ batchUrl: BATCH_URL, ids });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((outcome.raw as { value: unknown[] }).value).toHaveLength(201);
  });

  it("asks nothing at all when there is nobody to ask about", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await readProjectQueryLinksInPage({ batchUrl: BATCH_URL, ids: [] })).toEqual({
      ok: true,
      raw: { value: [] },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a refused read rather than answering with an empty catalog", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 401 } as Response),
    ) as unknown as typeof fetch;

    const outcome = await readProjectQueryLinksInPage({ batchUrl: BATCH_URL, ids: [1] });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("401");
  });

  it("treats a page with no `value` as an empty page rather than a failure", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(ok({}))) as unknown as typeof fetch;

    expect(await readProjectQueryLinksInPage({ batchUrl: BATCH_URL, ids: [1] })).toEqual({
      ok: true,
      raw: { value: [] },
    });
  });
});
