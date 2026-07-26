import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFeatureCrewInPage, type FeatureCrewApplyConfig } from "./applyFeatureCrewInPage";

const URL = "https://ado.example/_apis/wit/workitems/123";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

function errorResponse(status: number, text: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error("should read text, not json")),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function parseJsonPatchBody(init: RequestInit | undefined): unknown[] {
  return JSON.parse(init?.body as string) as unknown[];
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("applyFeatureCrewInPage - create and transition", () => {
  it("creates a work item in its default state then transitions it to the requested closed state, returning { id }", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "create",
      url: URL,
      description: "Crew description",
      title: "Feature Crew",
      state: "Removed",
      rootRelationUrl: "https://ado.example/_apis/wit/workitems/100",
      affectedByRel: "System.LinkTypes.Hierarchy-Reverse",
      itemBaseUrl: "https://ado.example/_apis/wit/workitems",
    };

    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ id: 456 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: 456 });

    // Step 1: create in the default new state — the POST must NOT carry a System.State op, because
    // ADO rejects a direct create into "Removed".
    const createCall = fetchMock.mock.calls[0]!;
    expect(createCall[0]).toBe(URL);
    const createInit = createCall[1];
    expect(createInit?.method).toBe("POST");
    expect(createInit?.headers).toEqual({
      "Content-Type": "application/json-patch+json",
      Accept: "application/json",
    });
    expect(createInit?.credentials).toBe("include");

    const createOps = parseJsonPatchBody(createInit);
    expect(createOps).toEqual([
      { op: "add", path: "/fields/System.Title", value: "Feature Crew" },
      { op: "add", path: "/fields/System.Description", value: "Crew description" },
      { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
      {
        op: "add",
        path: "/relations/-",
        value: {
          rel: "System.LinkTypes.Hierarchy-Reverse",
          url: "https://ado.example/_apis/wit/workitems/100",
        },
      },
    ]);

    // Step 2: transition the just-created item (by id) to the requested closed state.
    const transitionCall = fetchMock.mock.calls[1]!;
    expect(transitionCall[0]).toBe("https://ado.example/_apis/wit/workitems/456?api-version=7.1");
    const transitionInit = transitionCall[1];
    expect(transitionInit?.method).toBe("PATCH");
    const transitionOps = parseJsonPatchBody(transitionInit);
    expect(transitionOps).toEqual([{ op: "add", path: "/fields/System.State", value: "Removed" }]);
  });
});

describe("applyFeatureCrewInPage - create failures and update", () => {
  it("reports the transition error and does not return an id when the state PATCH is rejected", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "create",
      url: URL,
      description: "Crew description",
      title: "Feature Crew",
      state: "Removed",
      rootRelationUrl: "https://ado.example/_apis/wit/workitems/100",
      affectedByRel: "System.LinkTypes.Hierarchy-Reverse",
      itemBaseUrl: "https://ado.example/_apis/wit/workitems",
    };

    const fetchMock = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ id: 456 }))
      .mockResolvedValueOnce(
        errorResponse(400, JSON.stringify({ message: "TF401320: Rule Error." })),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "HTTP 400: TF401320: Rule Error." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not attempt a transition when the create response has no numeric id", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "create",
      url: URL,
      description: "Crew description",
      title: "Feature Crew",
      state: "Removed",
      rootRelationUrl: "https://ado.example/_apis/wit/workitems/100",
      affectedByRel: "System.LinkTypes.Hierarchy-Reverse",
      itemBaseUrl: "https://ado.example/_apis/wit/workitems",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: "not-a-number" })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "response had no numeric work item id" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updates a work item by patching only the description op with PATCH method", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Updated description",
    };

    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ id: 789 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: 789 });

    const call = fetchMock.mock.calls[0]!;
    const init = call[1];
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json-patch+json",
      Accept: "application/json",
    });

    const ops = parseJsonPatchBody(init);
    expect(ops).toEqual([
      { op: "add", path: "/fields/System.Description", value: "Updated description" },
      { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
    ]);
  });
});

describe("applyFeatureCrewInPage - error reporting", () => {
  it("reports the HTTP status and ADO error message when the response is not ok", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "create",
      url: URL,
      description: "Test",
      title: "Test",
      state: "New",
      rootRelationUrl: "https://ado.example/_apis/wit/workitems/1",
      affectedByRel: "rel",
    };

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        errorResponse(403, JSON.stringify({ message: "TF401232: Access denied for user." })),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({
      id: null,
      error: "HTTP 403: TF401232: Access denied for user.",
    });
  });

  it("falls back to the raw error body when it is not JSON", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.resolve(errorResponse(500, "Internal Server Error")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "HTTP 500: Internal Server Error" });
  });

  it("reports just the status when the error body cannot be read", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error("stream error")),
      } as unknown as Response),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "HTTP 502" });
  });
});

describe("applyFeatureCrewInPage - missing id reporting", () => {
  it("reports a missing numeric id on an otherwise-ok response", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: "not-a-number" })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "response had no numeric work item id" });
  });

  it("reports the thrown value when fetch rejects", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.reject(new Error("network error")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "Error: network error" });
  });

  it("reports a missing numeric id when the response body is null", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "response had no numeric work item id" });
  });

  it("reports a missing numeric id when the response body has no id field", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ someOtherField: 123 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: null, error: "response had no numeric work item id" });
  });
});
