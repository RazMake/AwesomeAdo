import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkItemInPage } from "./createWorkItemInPage";

const CREATE_URL = "https://ado.example/proj/_apis/wit/workitems/%24Epic?api-version=7.1";
const PATCH = [{ op: "add", path: "/fields/System.Title", value: "Payments" }];

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function respond(response: Partial<Response>): ReturnType<typeof vi.fn> {
  const mock = vi.fn(() => Promise.resolve(response as Response));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe("createWorkItemInPage", () => {
  it("POSTs the patch with the signed-in session and reports the created item", async () => {
    const fetchMock = respond({ ok: true, status: 200, json: () => Promise.resolve({ id: 42 }) });

    const outcome = await createWorkItemInPage({ createUrl: CREATE_URL, patch: PATCH });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CREATE_URL);
    expect(init.method).toBe("POST");
    // Credentials must ride along, or ADO answers the page-world write with a sign-in redirect.
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json-patch+json",
    );
    expect(JSON.parse(init.body as string)).toEqual(PATCH);
    expect(outcome).toEqual({ ok: true, raw: { id: 42 } });
  });

  it("reports the status rather than retrying, so a POST is never sent twice", async () => {
    const fetchMock = respond({ ok: false, status: 403, json: () => Promise.resolve(null) });

    expect(await createWorkItemInPage({ createUrl: CREATE_URL, patch: PATCH })).toEqual({
      ok: false,
      error: "HTTP 403",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a body that is not JSON instead of pretending nothing was created", async () => {
    respond({ ok: true, status: 200, json: () => Promise.reject(new Error("boom")) });

    const outcome = await createWorkItemInPage({ createUrl: CREATE_URL, patch: PATCH });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("invalid JSON");
  });

  it("reports a network failure as the outcome rather than rejecting", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const outcome = await createWorkItemInPage({ createUrl: CREATE_URL, patch: PATCH });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("offline");
  });
});
