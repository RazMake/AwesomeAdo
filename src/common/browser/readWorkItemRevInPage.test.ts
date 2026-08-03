import { afterEach, describe, expect, it, vi } from "vitest";

import { readWorkItemRevInPage } from "./readWorkItemRevInPage";

const ITEM_URL = "https://ado.example/contoso/_apis/wit/workitems/10?api-version=7.1";

type Call = [string, RequestInit | undefined];

/** Stubs `fetch` with one outcome, recording how it was called. */
function stubFetch(response: Response | Error): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  });
  return { calls };
}

const reply = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: () => Promise.resolve(body) }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readWorkItemRevInPage", () => {
  it("reads the item with the page's own session and hands back its revision", async () => {
    const { calls } = stubFetch(reply({ id: 10, rev: 14 }));

    expect(await readWorkItemRevInPage({ itemUrl: ITEM_URL })).toBe(14);
    // ADO's session cookies are SameSite, so the page-world call must send credentials.
    expect(calls).toEqual([
      [ITEM_URL, { credentials: "include", headers: { Accept: "application/json" } }],
    ]);
  });
});

// Every failure answers `null` rather than a guess: this read follows a move that has ALREADY
// landed, so inventing a revision would poison the very write it exists to protect.
describe("readWorkItemRevInPage - when the revision cannot be read", () => {
  it("reports nothing on an error status", async () => {
    stubFetch(reply(null, false, 404));

    expect(await readWorkItemRevInPage({ itemUrl: ITEM_URL })).toBeNull();
  });

  it("reports nothing when the body carries no revision", async () => {
    stubFetch(reply({ id: 10 }));

    expect(await readWorkItemRevInPage({ itemUrl: ITEM_URL })).toBeNull();
  });

  it("rejects a non-finite revision rather than passing NaN on as a rev", async () => {
    // A NaN would serialize into the next patch's `test /rev` op as `null` and fail every write.
    stubFetch(reply({ id: 10, rev: NaN }));

    expect(await readWorkItemRevInPage({ itemUrl: ITEM_URL })).toBeNull();
  });

  it("degrades rather than throwing when the request never completes", async () => {
    stubFetch(new Error("offline"));

    expect(await readWorkItemRevInPage({ itemUrl: ITEM_URL })).toBeNull();
  });
});
