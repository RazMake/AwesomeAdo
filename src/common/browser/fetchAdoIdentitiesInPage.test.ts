import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAdoIdentitiesInPage } from "./fetchAdoIdentitiesInPage";

const SEARCH_URL =
  "https://dev.azure.com/contoso/_apis/IdentityPicker/Identities?api-version=5.0-preview.1";
const BODY = JSON.stringify({ query: "ada" });

/** A fetch answer carrying `text`, since the injected function reads the body as text first. */
function textResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAdoIdentitiesInPage", () => {
  it("posts the search with the session credentials and returns the parsed body", async () => {
    const body = { results: [{ identities: [{ displayName: "Ada" }] }] };
    const fetchMock = vi.fn(() => Promise.resolve(textResponse(JSON.stringify(body))));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoIdentitiesInPage(SEARCH_URL, BODY);

    expect(fetchMock).toHaveBeenCalledWith(SEARCH_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Suppressing the sign-in redirect is what turns an expired session into a real failure
        // instead of a 200 carrying an HTML login page.
        "X-TFS-FedAuthRedirect": "Suppress",
      },
      body: BODY,
    });
    expect(result).toEqual({ status: 200, body, failure: "none" });
  });

  it("reports the status when Azure DevOps rejects the request", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(textResponse('{"message":"bad request"}', 400)),
    ) as unknown as typeof fetch;

    // The status is what tells a rejected request apart from a genuine "nobody matched".
    expect(await fetchAdoIdentitiesInPage(SEARCH_URL, BODY)).toEqual({
      status: 400,
      body: null,
      failure: "http",
    });
  });

  it("reports a 200 that is not JSON as an expired session", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(textResponse("<html>sign in</html>")),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIdentitiesInPage(SEARCH_URL, BODY)).toEqual({
      status: 200,
      body: null,
      failure: "sign-in",
    });
  });

  it("reports a request that never completed", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;

    expect(await fetchAdoIdentitiesInPage(SEARCH_URL, BODY)).toEqual({
      status: 0,
      body: null,
      failure: "network",
    });
  });
});
