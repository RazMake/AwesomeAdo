import { afterEach, describe, expect, it, vi } from "vitest";

import { readWorkItemRanksInPage } from "./readWorkItemRanksInPage";

const BATCH_URL = "https://ado.example/contoso/web/_apis/wit/workitemsbatch?api-version=7.1";
const FIELD = "Microsoft.VSTS.Common.StackRank";

const config = { batchUrl: BATCH_URL, ids: [1, 2], field: FIELD };

/** A minimal `Response` stand-in: only `ok`, `status`, `json()` and `text()` are ever read. */
const reply = (body: unknown, ok = true, status = 200, text?: string): Response =>
  ({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text ?? JSON.stringify(body)),
  }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readWorkItemRanksInPage", () => {
  it("POSTs the ids and the one field it needs, with the page's session", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return Promise.resolve(reply({ value: [] }));
    });

    await readWorkItemRanksInPage(config);

    const [url, init] = calls[0]!;
    expect(url).toBe(BATCH_URL);
    expect(init?.method).toBe("POST");
    // ADO's session cookies are SameSite, so the page-world call must send credentials.
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(init?.body as string)).toEqual({ ids: [1, 2], fields: [FIELD] });
  });

  it("hands the body back unparsed, so reading it stays unit-testable module code", async () => {
    const body = { value: [{ id: 1, fields: { [FIELD]: 100 } }] };
    vi.stubGlobal("fetch", () => Promise.resolve(reply(body)));

    expect(await readWorkItemRanksInPage(config)).toEqual({ ok: true, body });
  });

  it("reports the status and what Azure DevOps said when the read is refused", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(reply({}, false, 400, "bad ids")));

    expect(await readWorkItemRanksInPage(config)).toEqual({
      ok: false,
      error: "ranks HTTP 400: bad ids",
    });
  });

  it("truncates a long error body so one failure cannot flood a bounded log", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(reply({}, false, 500, "x".repeat(1000))));

    const result = await readWorkItemRanksInPage(config);

    expect(result.error).toHaveLength("ranks HTTP 500: ".length + 300);
  });

  it("still reports the status when the error body cannot be read", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error("stream closed")),
      } as unknown as Response),
    );

    expect(await readWorkItemRanksInPage(config)).toEqual({ ok: false, error: "ranks HTTP 503" });
  });

  it("resolves with a failure rather than throwing when the fetch itself rejects", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));

    const result = await readWorkItemRanksInPage(config);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });
});
