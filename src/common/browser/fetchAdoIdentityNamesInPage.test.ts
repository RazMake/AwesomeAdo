import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAdoIdentityNamesInPage } from "./fetchAdoIdentityNamesInPage";

const PICKER_URL =
  "https://dev.azure.com/contoso/_apis/IdentityPicker/Identities?api-version=5.2-preview.1";
const ADA = "11111111-2222-3333-4444-555555555555";
const GRACE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** A fetch answer carrying `text`, since the injected function reads the body as text first. */
function textResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

/** The identity id a recorded request asked about, read back out of its JSON body. */
function queriedId(init: RequestInit): unknown {
  return (JSON.parse(String(init.body)) as { query?: unknown }).query;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAdoIdentityNamesInPage", () => {
  it("asks about every id with the session credentials and returns their bodies", async () => {
    const bodies = [{ results: [{ queryToken: ADA }] }, { results: [{ queryToken: GRACE }] }];
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      Promise.resolve(
        textResponse(JSON.stringify(queriedId(init) === ADA ? bodies[0] : bodies[1])),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAdoIdentityNamesInPage(PICKER_URL, [ADA, GRACE], 2);

    expect(result).toEqual({ status: 200, bodies, failure: "none" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(PICKER_URL);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
      // Suppressing the sign-in redirect is what turns an expired session into a real failure
      // instead of a 200 carrying an HTML login page that parses as "nobody by that id".
      "X-TFS-FedAuthRedirect": "Suppress",
    });
  });

  it("tells the picker the query is an identifier, not text to match names against", async () => {
    // Without `queryTypeHint: "uid"` the picker searches display names for the literal GUID, matches
    // nobody, and every mention on the board stays anonymous despite a clean HTTP 200.
    const sent: unknown[] = [];
    globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return Promise.resolve(textResponse("{}"));
    }) as unknown as typeof fetch;

    await fetchAdoIdentityNamesInPage(PICKER_URL, [ADA], 1);

    expect(sent[0]).toMatchObject({ query: ADA, queryTypeHint: "uid" });
  });

  it("keeps the ids that resolved when one request is rejected", async () => {
    // One person failing to resolve must not throw away the names the other requests returned.
    const body = { results: [{ queryToken: ADA }] };
    globalThis.fetch = vi.fn((_url: string, init: RequestInit) =>
      Promise.resolve(
        queriedId(init) === ADA ? textResponse(JSON.stringify(body)) : textResponse("nope", 400),
      ),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage(PICKER_URL, [ADA, GRACE], 2)).toEqual({
      status: 400,
      bodies: [body],
      failure: "http",
    });
  });
});

describe("fetchAdoIdentityNamesInPage failure classification", () => {
  it("reports a 200 that is not JSON as an expired session", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(textResponse("<html>sign in</html>")),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage(PICKER_URL, [ADA], 1)).toEqual({
      status: 200,
      bodies: [],
      failure: "sign-in",
    });
  });

  it("reports a request that never completed rather than a silent empty answer", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("blocked"))) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage(PICKER_URL, [ADA], 1)).toEqual({
      status: 0,
      bodies: [],
      failure: "network",
    });
  });

  it("reports the first failure in id order, not in whichever order the answers landed", async () => {
    // The pool makes completion order scheduling-dependent; reporting by id order is what keeps the
    // same board producing the same diagnostics line on every run.
    globalThis.fetch = vi.fn((_url: string, init: RequestInit) =>
      queriedId(init) === ADA
        ? Promise.resolve(textResponse("nope", 401))
        : Promise.reject(new Error("blocked")),
    ) as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage(PICKER_URL, [ADA, GRACE], 2)).toEqual({
      status: 401,
      bodies: [],
      failure: "http",
    });
  });
});

describe("fetchAdoIdentityNamesInPage request pool", () => {
  it("never runs more requests at once than the pool allows", async () => {
    // A heavily-mentioned board must not fire one credentialed request per person simultaneously and
    // starve the ADO page's own traffic behind the browser's per-host connection limit.
    let running = 0;
    let peak = 0;
    globalThis.fetch = vi.fn(() => {
      running += 1;
      peak = Math.max(peak, running);
      return Promise.resolve(textResponse("{}")).finally(() => {
        running -= 1;
      });
    }) as unknown as typeof fetch;

    await fetchAdoIdentityNamesInPage(PICKER_URL, [ADA, GRACE, ADA, GRACE, ADA], 2);

    expect(peak).toBe(2);
  });

  it("does nothing at all when there is nobody to ask about", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await fetchAdoIdentityNamesInPage(PICKER_URL, [], 6)).toEqual({
      status: 200,
      bodies: [],
      failure: "none",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
