import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAdoIterationsInPage } from "./fetchAdoIterationsInPage";

const ITERATIONS_URL =
  "https://dev.azure.com/contoso/web/Web/_apis/work/teamsettings/iterations?api-version=7.1";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAdoIterationsInPage", () => {
  it("fetches the iterations with the session credentials and returns the body", async () => {
    const body = { value: [{ name: "Sprint 1" }] };
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(body)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoIterationsInPage(ITERATIONS_URL);

    expect(fetchMock).toHaveBeenCalledWith(ITERATIONS_URL, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(result).toEqual(body);
  });

  it("returns null on a non-ok response", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(null, false)),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIterationsInPage(ITERATIONS_URL)).toBeNull();
  });

  it("returns null when the fetch rejects", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;

    expect(await fetchAdoIterationsInPage(ITERATIONS_URL)).toBeNull();
  });
});
