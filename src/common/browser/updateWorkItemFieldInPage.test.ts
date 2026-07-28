import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateWorkItemFieldInPage } from "./updateWorkItemFieldInPage";

const UPDATE_URL = "https://ado.example/_apis/wit/workitems/123";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

function parsePatchBody(init: RequestInit | undefined): Array<Record<string, unknown>> {
  return JSON.parse(init?.body as string) as Array<Record<string, unknown>>;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("updateWorkItemFieldInPage", () => {
  it("PATCHes an `add` op guarded by the rev when a value is set, and returns the new rev", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 6 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage(UPDATE_URL, 123, 5, "System.State", "Active");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(UPDATE_URL);
    // Credentials must ride along so ADO's SameSite session cookies authorize the page-world write.
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(parsePatchBody(init)).toEqual([
      { op: "test", path: "/rev", value: 5 },
      { op: "add", path: "/fields/System.State", value: "Active" },
    ]);
    expect(result).toEqual({ ok: true, rev: 6 });
  });

  it("PATCHes a `remove` op when the value is null (clearing the field)", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 7 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage(
      UPDATE_URL,
      123,
      6,
      "Microsoft.VSTS.Scheduling.TargetDate",
      null,
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(parsePatchBody(init)).toEqual([
      { op: "test", path: "/rev", value: 6 },
      { op: "remove", path: "/fields/Microsoft.VSTS.Scheduling.TargetDate" },
    ]);
    expect(result).toEqual({ ok: true, rev: 7 });
  });

  it("sets a multiline field's storage format in the SAME patch as its value", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 8 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage(
      UPDATE_URL,
      123,
      7,
      "System.Description",
      "**Bold** plan.",
      "Markdown",
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // One patch, not two: a field still on `Html` stores Markdown source verbatim, so a format set
    // afterwards would leave a revision of literal asterisks behind.
    expect(parsePatchBody(init)).toEqual([
      { op: "test", path: "/rev", value: 7 },
      { op: "add", path: "/fields/System.Description", value: "**Bold** plan." },
      { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
    ]);
  });

  it("leaves a field's format alone when none was asked for", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 9 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage(UPDATE_URL, 123, 8, "System.Title", "Renamed");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(parsePatchBody(init)).toHaveLength(2);
  });

  it("reports rev undefined when the response omits a numeric rev", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage(UPDATE_URL, 123, 5, "System.State", "Active");

    expect(result).toEqual({ ok: true, rev: undefined });
  });

  it("returns an HTTP error result when the response is not ok", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, false, 409)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage(UPDATE_URL, 123, 5, "System.State", "Active");

    expect(result).toEqual({ ok: false, error: "HTTP 409" });
  });

  it("returns a failure result when the fetch rejects", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage(UPDATE_URL, 123, 5, "System.State", "Active");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });
});
