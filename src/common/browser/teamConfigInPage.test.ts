import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTeamConfigInPage } from "./fetchTeamConfigInPage";
import { writeTeamConfigInPage } from "./writeTeamConfigInPage";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchTeamConfigInPage Description formats", () => {
  it("returns the work item Description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ fields: { "System.Description": '{"settings":{}}' } }),
      })),
    );

    await expect(fetchTeamConfigInPage("item-url")).resolves.toEqual({
      ok: true,
      text: '{"settings":{}}',
    });
  });

  it("extracts JSON from ADO-rendered Description HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            "System.Description":
              "<div>{&quot;awesomeAdoConfigVersion&quot;:1,&quot;settings&quot;:{},&quot;enhancedQueries&quot;:{}}</div>",
          },
        }),
      })),
    );

    await expect(fetchTeamConfigInPage("item-url")).resolves.toEqual({
      ok: true,
      text: '{"awesomeAdoConfigVersion":1,"settings":{},"enhancedQueries":{}}',
    });
  });

  it("decodes ADO entities when the Description starts with a JSON brace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            "System.Description":
              "{&quot;awesomeAdoConfigVersion&quot;:1,&quot;settings&quot;:{},&quot;enhancedQueries&quot;:{}}",
          },
        }),
      })),
    );

    await expect(fetchTeamConfigInPage("item-url")).resolves.toEqual({
      ok: true,
      text: '{"awesomeAdoConfigVersion":1,"settings":{},"enhancedQueries":{}}',
    });
  });

  it("extracts JSON from a Markdown-fenced Description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            "System.Description": '```json\n{"awesomeAdoConfigVersion":1}\n```',
          },
        }),
      })),
    );

    await expect(fetchTeamConfigInPage("item-url")).resolves.toEqual({
      ok: true,
      text: '{"awesomeAdoConfigVersion":1}',
    });
  });
});

describe("fetchTeamConfigInPage outcomes", () => {
  it("reports an HTTP failure", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTeamConfigInPage("item-url")).resolves.toEqual({
      ok: false,
      error: "HTTP 403",
    });
  });

  it("returns an empty successful read when no shared configuration exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ fields: {} }),
      })),
    );

    await expect(fetchTeamConfigInPage("item-url")).resolves.toEqual({
      ok: true,
      text: null,
    });
  });

  it("retries transient failures with bounded backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ fields: { "System.Description": "config" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchTeamConfigInPage("item-url");
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ ok: true, text: "config" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("writeTeamConfigInPage", () => {
  it("writes Description and its Markdown format in one revision-guarded patch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rev: 7, fields: { "System.Description": "old" } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(writeTeamConfigInPage({ url: "item-url", text: "new" })).resolves.toEqual({
      ok: true,
    });
    const patchRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(patchRequest.body))).toEqual([
      { op: "test", path: "/rev", value: 7 },
      { op: "replace", path: "/fields/System.Description", value: "new" },
      { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
    ]);
  });

  it("retries once when an unrelated edit advances the work item revision", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rev: 7, fields: { "System.Description": "old" } }),
      })
      .mockResolvedValueOnce({ ok: false, status: 412 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rev: 8, fields: { "System.Description": "old" } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(writeTeamConfigInPage({ url: "item-url", text: "new" })).resolves.toEqual({
      ok: true,
    });
    expect(JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body))).toEqual([
      { op: "test", path: "/rev", value: 8 },
      { op: "replace", path: "/fields/System.Description", value: "new" },
      { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
    ]);
  });

  it("reports a conflict when another publish changed the Description", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ rev: 7, fields: { "System.Description": "old" } }),
        })
        .mockResolvedValueOnce({ ok: false, status: 412 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ rev: 8, fields: { "System.Description": "other" } }),
        }),
    );

    await expect(writeTeamConfigInPage({ url: "item-url", text: "new" })).resolves.toEqual({
      ok: false,
      error: "HTTP 412 — team configuration changed since it was read",
    });
  });
});
