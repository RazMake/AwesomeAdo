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

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 5,
      field: "System.State",
      value: "Active",
    });

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

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 6,
      field: "Microsoft.VSTS.Scheduling.TargetDate",
      value: null,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(parsePatchBody(init)).toEqual([
      { op: "test", path: "/rev", value: 6 },
      { op: "remove", path: "/fields/Microsoft.VSTS.Scheduling.TargetDate" },
    ]);
    expect(result).toEqual({ ok: true, rev: 7 });
  });
});

describe("updateWorkItemFieldInPage - atomic fields", () => {
  it("PATCHes additional field changes in the same guarded revision", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 7 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 6,
      field: "System.State",
      value: "Active",
      additionalFields: [{ field: "System.AreaPath", value: "Project\\Apps" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(parsePatchBody(init)).toEqual([
      { op: "test", path: "/rev", value: 6 },
      { op: "add", path: "/fields/System.State", value: "Active" },
      { op: "add", path: "/fields/System.AreaPath", value: "Project\\Apps" },
    ]);
  });
});

describe("updateWorkItemFieldInPage - multiline format", () => {
  it("sets a multiline field's storage format in the SAME patch as its value", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 8 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 7,
      field: "System.Description",
      value: "**Bold** plan.",
      multilineFormat: "Markdown",
    });

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
    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 8,
      field: "System.Title",
      value: "Renamed",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(parsePatchBody(init)).toHaveLength(2);
  });
});

describe("updateWorkItemFieldInPage - setting a field that already holds a value", () => {
  it("REPLACES a field it was given the current value of, so a shortened tag list really shrinks", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 10 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 9,
      field: "System.Tags",
      value: "Needs review",
      baseValue: "Blocked; Needs review",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // `add` APPENDS to System.Tags: Azure DevOps answers the shortened list with a 200 and keeps
    // every tag, so a cleared marker comes back on the next read.
    expect(parsePatchBody(init)).toEqual([
      { op: "test", path: "/rev", value: 9 },
      { op: "replace", path: "/fields/System.Tags", value: "Needs review" },
    ]);
  });

  it("still ADDs when the field has no value to replace yet", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 11 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 10,
      field: "System.Tags",
      value: "Blocked",
      baseValue: "",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(parsePatchBody(init)[1]).toEqual({
      op: "add",
      path: "/fields/System.Tags",
      value: "Blocked",
    });
  });
});

describe("updateWorkItemFieldInPage - what it reports back", () => {
  it("reports rev undefined when the response omits a numeric rev", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 5,
      field: "System.State",
      value: "Active",
    });

    expect(result).toEqual({ ok: true, rev: undefined });
  });

  it("returns an HTTP error result when the response is not ok", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, false, 409)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 5,
      field: "System.State",
      value: "Active",
    });

    expect(result).toEqual({ ok: false, error: "HTTP 409" });
  });

  it("returns a failure result when the fetch rejects", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 5,
      field: "System.State",
      value: "Active",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });
});

describe("updateWorkItemFieldInPage - a comment riding in the same patch", () => {
  it("records the comment in the SAME patch as the field it explains", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 13 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 12,
      field: "System.Tags",
      value: "Blocked",
      comment: "[BLOCKED] Waiting on the API.",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // One patch means one revision. Posting the comment through the comments API instead would
    // advance the rev and get this very patch rejected on its own `test` op with HTTP 412.
    expect(parsePatchBody(init)).toEqual([
      { op: "test", path: "/rev", value: 12 },
      { op: "add", path: "/fields/System.Tags", value: "Blocked" },
      { op: "add", path: "/fields/System.History", value: "[BLOCKED] Waiting on the API." },
      { op: "add", path: "/multilineFieldsFormat/System.History", value: "Markdown" },
    ]);
  });

  it("stores the comment as Markdown, so an @-mention in it reaches the person", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 3 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 2,
      field: "System.Tags",
      value: "Blocked",
      comment: "[BLOCKED] Waiting on @<ca16a18e-f2f0-443a-ba90-f30b29950a3b>.",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // Left on the field's default HTML, ADO stores the comment HTML-ENCODED and the reader sees
    // markup where a name belongs; as Markdown the token resolves exactly as it does in a note.
    expect(parsePatchBody(init).slice(2)).toEqual([
      {
        op: "add",
        path: "/fields/System.History",
        value: "[BLOCKED] Waiting on @<ca16a18e-f2f0-443a-ba90-f30b29950a3b>.",
      },
      { op: "add", path: "/multilineFieldsFormat/System.History", value: "Markdown" },
    ]);
  });

  it("adds no comment op when none was given", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ rev: 3 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 2,
      field: "System.State",
      value: "Active",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(parsePatchBody(init)).toHaveLength(2);
  });

  it("carries no unserializable hole: every optional left out is simply absent", () => {
    // The regression this guards: an omitted optional passed POSITIONALLY is `undefined`, which
    // `chrome.scripting.executeScript` refuses to serialize — it rejects the whole injection, so
    // nothing reaches ADO and the board reports a bare "exception" that looks like a failed write.
    const config = {
      updateUrl: UPDATE_URL,
      rev: 2,
      field: "System.State",
      value: "Active",
      multilineFormat: undefined,
      comment: undefined,
    };

    expect(JSON.parse(JSON.stringify(config))).toEqual({
      updateUrl: UPDATE_URL,
      rev: 2,
      field: "System.State",
      value: "Active",
    });
  });
});

/**
 * A stale rev is the normal state of a board that has been used: a drag-reorder, the rank fallback
 * and a note posted from the panel all advance `System.Rev` without reporting the new one, so these
 * cover the one rebase that keeps the next edit from being refused forever.
 */

/** A fetch mock that refuses any PATCH whose rev is not `serverRev`, and serves the item on GET. */
function conflictingAdo(stored: unknown, serverRev: number) {
  return vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method !== "PATCH") {
      return Promise.resolve(jsonResponse({ rev: serverRev, fields: { "System.Tags": stored } }));
    }
    const rev = (parsePatchBody(init)[0] as { value: number }).value;
    return Promise.resolve(
      rev === serverRev ? jsonResponse({ rev: serverRev + 1 }) : jsonResponse({}, false, 412),
    );
  });
}

describe("updateWorkItemFieldInPage - rebasing a write whose rev went stale", () => {
  it("re-reads the item and retries against the server's rev when the field is untouched", async () => {
    const fetchMock = conflictingAdo("Blocked", 20);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 15,
      field: "System.Tags",
      value: "Blocked; Blocked by another team",
      baseValue: "Blocked",
      comment: "[BLOCKED] Waiting on the platform team.",
    });

    // PATCH (412) → GET → PATCH. The retry carries the rev the SERVER just reported, and the
    // comment rides along in it exactly as it did in the first attempt.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retry = parsePatchBody((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1]);
    expect(retry[0]).toEqual({ op: "test", path: "/rev", value: 20 });
    expect(retry[2]).toEqual({
      op: "add",
      path: "/fields/System.History",
      value: "[BLOCKED] Waiting on the platform team.",
    });
    expect(result).toEqual({ ok: true, rev: 21 });
  });

  it("treats an absent field as empty, so clearing one can still be rebased", async () => {
    const fetchMock = conflictingAdo(undefined, 20);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 15,
      field: "System.Tags",
      value: "Blocked",
      baseValue: "",
    });

    expect(result).toEqual({ ok: true, rev: 21 });
  });
});

describe("updateWorkItemFieldInPage - when it refuses to rebase", () => {
  it("refuses when the field itself changed — that is a real conflict", async () => {
    const fetchMock = conflictingAdo("Blocked; Someone else's tag", 20);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 15,
      field: "System.Tags",
      value: "Blocked; Blocked by another team",
      baseValue: "Blocked",
    });

    // PATCH → GET, and no second PATCH: rebasing here would drop the other person's tag.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("412");
  });

  it("never rebases when no base value was given", async () => {
    const fetchMock = conflictingAdo("Blocked", 20);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 15,
      field: "System.Tags",
      value: "Blocked; Blocked by another team",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: "HTTP 412" });
  });

  it("rebases at most once, so a moving item cannot spin the write in a loop", async () => {
    // The server refuses every PATCH, so the retry is refused as well.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PATCH"
          ? jsonResponse({}, false, 412)
          : jsonResponse({ rev: 20, fields: {} }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 15,
      field: "System.Tags",
      value: "Blocked",
      baseValue: "",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: false, error: "HTTP 412" });
  });

  it("reports the original conflict when the item cannot be re-read", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PATCH" ? jsonResponse({}, false, 412) : jsonResponse(null, false, 500),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await updateWorkItemFieldInPage({
      updateUrl: UPDATE_URL,
      rev: 15,
      field: "System.Tags",
      value: "Blocked",
      baseValue: "",
    });

    expect(result).toEqual({ ok: false, error: "HTTP 412" });
  });
});
