import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFeatureCrewInPage, type FeatureCrewApplyConfig } from "./applyFeatureCrewInPage";

const URL = "https://ado.example/_apis/wit/workitems/123";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
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

describe("applyFeatureCrewInPage", () => {
  it("creates a work item by posting a 4-op json-patch with correct headers and method, returning { id }", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "create",
      url: URL,
      description: "Crew description",
      title: "Feature Crew",
      state: "Removed",
      rootRelationUrl: "https://ado.example/_apis/wit/workitems/100",
      affectedByRel: "System.LinkTypes.Hierarchy-Reverse",
    };

    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ id: 456 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toEqual({ id: 456 });

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(URL);
    const init = call[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json-patch+json",
      Accept: "application/json",
    });
    expect(init?.credentials).toBe("include");

    const ops = parseJsonPatchBody(init);
    expect(ops).toEqual([
      { op: "add", path: "/fields/System.Title", value: "Feature Crew" },
      { op: "add", path: "/fields/System.State", value: "Removed" },
      { op: "add", path: "/fields/System.Description", value: "Crew description" },
      {
        op: "add",
        path: "/relations/-",
        value: {
          rel: "System.LinkTypes.Hierarchy-Reverse",
          url: "https://ado.example/_apis/wit/workitems/100",
        },
      },
    ]);
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
    ]);
  });

  it("returns null when the response is not ok", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "create",
      url: URL,
      description: "Test",
      title: "Test",
      state: "New",
      rootRelationUrl: "https://ado.example/_apis/wit/workitems/1",
      affectedByRel: "rel",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(null, false)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toBeNull();
  });

  it("returns null when the response body has no numeric id", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: "not-a-number" })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.reject(new Error("network error")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toBeNull();
  });

  it("returns null when the response body is null", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toBeNull();
  });

  it("returns null when the response body has no id field", async () => {
    const config: FeatureCrewApplyConfig = {
      mode: "update",
      url: URL,
      description: "Test",
    };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ someOtherField: 123 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await applyFeatureCrewInPage(config);

    expect(result).toBeNull();
  });
});
