import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAdoCapacityInPage } from "./fetchAdoCapacityInPage";

const CAPACITY_URL = "https://dev.azure.com/contoso/web/Web/_apis/work/capacities";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("fetchAdoCapacityInPage", () => {
  it("returns the roster with signed-in credentials", async () => {
    const raw = { value: [{ teamMember: { id: "1", displayName: "Alice" } }] };
    const fetchMock = vi.fn(() => Promise.resolve(response(200, raw)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchAdoCapacityInPage(CAPACITY_URL)).resolves.toEqual({ raw, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(CAPACITY_URL, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  });

  it("retries transient responses and stops after the third attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(response(503, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const outcome = fetchAdoCapacityInPage(CAPACITY_URL);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toEqual({ raw: null, status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent failures", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response(403, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchAdoCapacityInPage(CAPACITY_URL)).resolves.toEqual({ raw: null, status: 403 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports a network failure after three attempts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const outcome = fetchAdoCapacityInPage(CAPACITY_URL);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toEqual({ raw: null, status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
