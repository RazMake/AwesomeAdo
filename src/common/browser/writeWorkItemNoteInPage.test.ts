import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeWorkItemNoteInPage } from "./writeWorkItemNoteInPage";

const ADD_URL = "https://ado.example/proj/_apis/wit/workItems/42/comments?format=0";
const EDIT_URL = "https://ado.example/proj/_apis/wit/workItems/42/comments/7?format=0";
const TEXT = "A note.";

/** The write init both verbs share: the page's own session, JSON in and JSON out. */
function writeInit(method: string): RequestInit {
  return {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ text: TEXT }),
  };
}

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

describe("writeWorkItemNoteInPage — request shape", () => {
  it("POSTs a new note to the add URL with the text as its JSON body", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: 9 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await writeWorkItemNoteInPage(ADD_URL, "POST", TEXT);

    expect(fetchMock).toHaveBeenCalledWith(ADD_URL, writeInit("POST"));
  });

  it("PATCHes a correction to the comment's own URL, passing the caller's verb through", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: 7 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await writeWorkItemNoteInPage(EDIT_URL, "PATCH", TEXT);

    expect(fetchMock).toHaveBeenCalledWith(EDIT_URL, writeInit("PATCH"));
  });
});

describe("writeWorkItemNoteInPage — outcomes", () => {
  it("hands back exactly what Azure DevOps stored", async () => {
    const saved = { id: 9, text: TEXT, createdDate: "2026-07-24T12:00:00Z" };
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(saved))) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(ADD_URL, "POST", TEXT)).resolves.toEqual({
      ok: true,
      raw: saved,
    });
  });

  it("reports the refused status rather than pretending the note was stored", async () => {
    // ADO rejects an edit from anyone but the note's author; that 403 must reach the caller.
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(null, false, 403)),
    ) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(EDIT_URL, "PATCH", TEXT)).resolves.toEqual({
      ok: false,
      error: "HTTP 403",
    });
  });

  it("degrades rather than throwing when the request is rejected outright", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(ADD_URL, "POST", TEXT)).resolves.toEqual({
      ok: false,
      error: "Error: offline",
    });
  });
});
