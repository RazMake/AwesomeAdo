import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAdoIdentityNamesInPage } from "./fetchAdoIdentityNamesInPage";

const BATCH_ONE = "https://vssps.dev.azure.com/contoso/_apis/identities?identityIds=a";
const BATCH_TWO = "https://vssps.dev.azure.com/contoso/_apis/identities?identityIds=b";

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

describe("fetchAdoIdentityNamesInPage", () => {
  it("reads every batch with the session credentials and returns their bodies", async () => {
    const bodies = [{ value: [{ id: "a" }] }, { value: [{ id: "b" }] }];
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(textResponse(JSON.stringify(url === BATCH_ONE ? bodies[0] : bodies[1]))),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoIdentityNamesInPage([BATCH_ONE, BATCH_TWO]);

    expect(fetchMock).toHaveBeenCalledWith(BATCH_ONE, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        // Suppressing the sign-in redirect is what turns an expired session into a real failure
        // instead of a 200 carrying an HTML login page that parses as "nobody by that id".
        "X-TFS-FedAuthRedirect": "Suppress",
      },
    });
    expect(result).toEqual({ status: 200, bodies, failure: "none" });
  });

  it("keeps the batches that succeeded when one is rejected", async () => {
    // The split into batches is an implementation detail of URL length; one failing batch must not
    // throw away names the others returned.
    const body = { value: [{ id: "a" }] };
    globalThis.fetch = vi.fn((url: string) =>
      Promise.resolve(
        url === BATCH_ONE ? textResponse(JSON.stringify(body)) : textResponse("nope", 400),
      ),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage([BATCH_ONE, BATCH_TWO])).toEqual({
      status: 400,
      bodies: [body],
      failure: "http",
    });
  });

  it("reports a 200 that is not JSON as an expired session", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(textResponse("<html>sign in</html>")),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage([BATCH_ONE])).toEqual({
      status: 200,
      bodies: [],
      failure: "sign-in",
    });
  });

  it("reports a request that never completed, which covers a refused cross-origin hop", async () => {
    // The identity service is a different host from the page, so a tenant that refuses the hop
    // arrives here as a rejected fetch — it must be a named failure, not a silent empty answer.
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("blocked"))) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage([BATCH_ONE])).toEqual({
      status: 0,
      bodies: [],
      failure: "network",
    });
  });

  it("reports only the first failure, so a bounded log is not flooded by one bad session", async () => {
    globalThis.fetch = vi.fn((url: string) =>
      url === BATCH_ONE
        ? Promise.resolve(textResponse("nope", 401))
        : Promise.reject(new Error("blocked")),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage([BATCH_ONE, BATCH_TWO])).toEqual({
      status: 401,
      bodies: [],
      failure: "http",
    });
  });
});
