import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadAttachmentInPage } from "./uploadAttachmentInPage";

const URL_ = "https://ado.example/proj/_apis/wit/attachments?fileName=a.png&uploadType=Simple";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("uploadAttachmentInPage", () => {
  it("posts the decoded bytes with the page's own session and returns ADO's answer", async () => {
    const stored = { id: "a1", url: "https://ado.example/_apis/wit/attachments/a1" };
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(stored)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadAttachmentInPage({ url: URL_, contentBase64: "AQID" });

    expect(result).toEqual({ ok: true, raw: stored });
    expect(fetchMock).toHaveBeenCalledWith(URL_, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/octet-stream", Accept: "application/json" },
      body: new Uint8Array([1, 2, 3]),
    });
  });

  it("reports content that does not decode, without calling ADO", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadAttachmentInPage({ url: URL_, contentBase64: "*" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^invalid base64: /);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a refused upload by its status", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({}, false, 413)),
    ) as unknown as typeof fetch;

    expect(await uploadAttachmentInPage({ url: URL_, contentBase64: "AQID" })).toEqual({
      ok: false,
      error: "HTTP 413",
    });
  });

  it("reports an answer that is not JSON", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("bad")),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    const result = await uploadAttachmentInPage({ url: URL_, contentBase64: "AQID" });

    expect(result).toEqual({ ok: false, error: "invalid JSON: SyntaxError: bad" });
  });

  it("reports a request that never reached ADO", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    ) as unknown as typeof fetch;

    const result = await uploadAttachmentInPage({ url: URL_, contentBase64: "AQID" });

    expect(result).toEqual({ ok: false, error: "TypeError: Failed to fetch" });
  });
});
