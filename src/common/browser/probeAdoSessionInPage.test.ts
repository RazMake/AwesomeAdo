import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeAdoSessionInPage } from "./probeAdoSessionInPage";

const PROBE_URL = "https://dev.azure.com/contoso/_apis/ConnectionData?api-version=7.1-preview.1";

function fakeResponse(
  status: number,
  text: () => Promise<string>,
  type: ResponseType = "basic",
): Response {
  return { status, type, text } as unknown as Response;
}

function stubFetch(result: Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => result);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("probeAdoSessionInPage", () => {
  it("reads the URL with the session cookie, no cache, manual redirects and suppressed sign-in", async () => {
    const fetchMock = stubFetch(Promise.resolve(fakeResponse(200, () => Promise.resolve("{}"))));

    await probeAdoSessionInPage(PROBE_URL);

    expect(fetchMock).toHaveBeenCalledWith(PROBE_URL, {
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
    });
  });

  it("returns the status and body text of a readable response", async () => {
    stubFetch(Promise.resolve(fakeResponse(401, () => Promise.resolve("denied"))));

    expect(await probeAdoSessionInPage(PROBE_URL)).toEqual({ status: 401, body: "denied" });
  });

  it("reports an opaque redirect as a 302 toward sign-in without reading the body", async () => {
    const text = vi.fn(() => Promise.resolve("unused"));
    stubFetch(Promise.resolve(fakeResponse(0, text, "opaqueredirect")));

    expect(await probeAdoSessionInPage(PROBE_URL)).toEqual({
      status: 302,
      body: null,
      error: "redirected toward sign-in",
    });
    expect(text).not.toHaveBeenCalled();
  });

  it("returns a null body with the reason when the body cannot be read", async () => {
    stubFetch(Promise.resolve(fakeResponse(200, () => Promise.reject(new Error("aborted")))));

    expect(await probeAdoSessionInPage(PROBE_URL)).toEqual({
      status: 200,
      body: null,
      error: "unreadable body: Error: aborted",
    });
  });

  it("returns status 0 with a network reason when the fetch rejects", async () => {
    stubFetch(Promise.reject(new TypeError("Failed to fetch")));

    expect(await probeAdoSessionInPage(PROBE_URL)).toEqual({
      status: 0,
      body: null,
      error: "network: TypeError: Failed to fetch",
    });
  });
});
