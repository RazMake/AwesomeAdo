import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WriteWorkItemNoteConfig } from "./WorkItemNoteRequest";
import { writeWorkItemNoteInPage } from "./writeWorkItemNoteInPage";

const ADD_URL = "https://ado.example/proj/_apis/wit/workItems/42/comments?format=0";
const EDIT_URL = "https://ado.example/proj/_apis/wit/workItems/42/comments/7?format=0";
const ITEM_URL = "https://ado.example/_apis/wit/workitems/42?api-version=7.1";
const TEXT = "A note.";

function addConfig(overrides: Partial<WriteWorkItemNoteConfig> = {}): WriteWorkItemNoteConfig {
  return { url: ADD_URL, method: "POST", text: TEXT, ...overrides };
}

function editConfig(overrides: Partial<WriteWorkItemNoteConfig> = {}): WriteWorkItemNoteConfig {
  return { url: EDIT_URL, method: "PATCH", text: TEXT, ...overrides };
}

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

/** Answers the comment write with `saved`, then the follow-up item read with `item`. */
function fetchSequence(saved: unknown, item: unknown): ReturnType<typeof vi.fn> {
  let written = false;
  return vi.fn(() => {
    const body = written ? item : saved;
    written = true;
    return Promise.resolve(jsonResponse(body));
  });
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

    await writeWorkItemNoteInPage(addConfig());

    expect(fetchMock).toHaveBeenCalledWith(ADD_URL, writeInit("POST"));
  });

  it("PATCHes a correction to the comment's own URL, passing the caller's verb through", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: 7 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await writeWorkItemNoteInPage(editConfig());

    expect(fetchMock).toHaveBeenCalledWith(EDIT_URL, writeInit("PATCH"));
  });

  it("leaves the item unread when the tab named no ADO collection to read it from", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: 9 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await writeWorkItemNoteInPage(addConfig());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("writeWorkItemNoteInPage — outcomes", () => {
  it("hands back exactly what Azure DevOps stored", async () => {
    const saved = { id: 9, text: TEXT, createdDate: "2026-07-24T12:00:00Z" };
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(saved))) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(addConfig())).resolves.toEqual({
      ok: true,
      raw: saved,
    });
  });

  it("reports the refused status rather than pretending the note was stored", async () => {
    // ADO rejects an edit from anyone but the note's author; that 403 must reach the caller.
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(null, false, 403)),
    ) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(editConfig())).resolves.toEqual({
      ok: false,
      error: "HTTP 403",
    });
  });

  it("degrades rather than throwing when the request is rejected outright", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(addConfig())).resolves.toEqual({
      ok: false,
      error: "Error: offline",
    });
  });
});

// A comment is a work item REVISION, and the comments API says nothing about the item — so this
// re-read is the only thing standing between a note and an HTTP 412 on the author's next edit.
describe("writeWorkItemNoteInPage — the revision the note created", () => {
  it("reads the item afterwards and reports its new rev", async () => {
    const saved = { id: 9, text: TEXT };
    const fetchMock = fetchSequence(saved, { id: 42, rev: 13 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(addConfig({ workItemUrl: ITEM_URL }))).resolves.toEqual({
      ok: true,
      raw: saved,
      rev: 13,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, ITEM_URL, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  });

  it("re-reads after a correction too, because an edited comment is its own revision", async () => {
    globalThis.fetch = fetchSequence({ id: 7 }, { id: 42, rev: 21 }) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(editConfig({ workItemUrl: ITEM_URL }))).resolves.toEqual({
      ok: true,
      raw: { id: 7 },
      rev: 21,
    });
  });

  it("still reports the stored note when the item read is rejected", async () => {
    // The note IS saved by this point; turning a failed follow-up read into a failed write would
    // tell the author their note was lost, and leave a duplicate when they retyped it.
    let written = false;
    globalThis.fetch = vi.fn(() => {
      if (written) {
        return Promise.reject(new Error("offline"));
      }
      written = true;
      return Promise.resolve(jsonResponse({ id: 9 }));
    }) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(addConfig({ workItemUrl: ITEM_URL }))).resolves.toEqual({
      ok: true,
      raw: { id: 9 },
    });
  });

  it("reports no rev when the item read answers with an error status", async () => {
    globalThis.fetch = vi.fn((input: unknown) =>
      Promise.resolve(
        input === ITEM_URL ? jsonResponse(null, false, 404) : jsonResponse({ id: 9 }),
      ),
    ) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(addConfig({ workItemUrl: ITEM_URL }))).resolves.toEqual({
      ok: true,
      raw: { id: 9 },
    });
  });

  it("reports no rev when the item body carries none", async () => {
    globalThis.fetch = fetchSequence({ id: 9 }, { id: 42 }) as unknown as typeof fetch;

    await expect(writeWorkItemNoteInPage(addConfig({ workItemUrl: ITEM_URL }))).resolves.toEqual({
      ok: true,
      raw: { id: 9 },
    });
  });
});
