import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discardAttachmentInPage } from "./discardAttachmentInPage";

const URL_ = "https://ado.example/proj/_apis/wit/attachments/a1?api-version=7.2-preview.4";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("discardAttachmentInPage", () => {
  it("deletes the attachment with the page's own session", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await discardAttachmentInPage(URL_)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(URL_, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  });

  it("reports the status Azure DevOps refused the delete with", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 403 } as Response),
    ) as unknown as typeof fetch;

    expect(await discardAttachmentInPage(URL_)).toEqual({ ok: false, error: "HTTP 403" });
  });

  it("reports a request that never reached Azure DevOps", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    ) as unknown as typeof fetch;

    expect(await discardAttachmentInPage(URL_)).toEqual({
      ok: false,
      error: "TypeError: Failed to fetch",
    });
  });
});
