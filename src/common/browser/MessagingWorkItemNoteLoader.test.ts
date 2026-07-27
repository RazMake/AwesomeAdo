import { describe, expect, it, vi, type Mock } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { MessagingWorkItemNoteLoader } from "./MessagingWorkItemNoteLoader";
import {
  LOAD_WORK_ITEM_NOTES_MESSAGE,
  type LoadWorkItemNotesResponse,
  type RawWorkItemNotes,
} from "./WorkItemNoteRequest";

const WORK_ITEM_ID = 42;
const SINCE = "2026-07-10T00:00:00Z";
const NOTE_TEXT = "Customer escalation from Contoso.";
const AUTHOR_NAME = "Alice Smith";

/** One raw ADO comment carrying content the diagnostics log must never repeat. */
const RAW_COMMENT = {
  id: 1,
  createdDate: "2026-07-20T09:00:00Z",
  createdBy: { displayName: AUTHOR_NAME, id: "guid-one", uniqueName: "alice@example.com" },
  text: NOTE_TEXT,
  renderedText: `<p>${NOTE_TEXT}</p>`,
};

const RAW_CONNECTION = {
  authenticatedUser: {
    id: "guid-one",
    providerDisplayName: AUTHOR_NAME,
    properties: { Account: { $value: "alice@example.com" } },
  },
};

/**
 * A logger that records what it was asked to write, so a test can inspect every line.
 *
 * Typed as an `ILogger` at the point of construction so a drift in that contract fails the
 * type-check rather than silently leaving an assertion checking a method nothing calls.
 */
function recordingLogger(): { info: Mock; error: Mock; logger: ILogger } {
  const info = vi.fn();
  const error = vi.fn();
  return { info, error, logger: { info, error } };
}

/** Every message text the logger was handed, whatever level it was written at. */
function loggedLines(recorded: { info: Mock; error: Mock }): string[] {
  return [...recorded.info.mock.calls, ...recorded.error.mock.calls].map((call) => String(call[0]));
}

/** A successfully-read raw payload, so each test names only the bodies it cares about. */
function rawRead(pages: unknown[], connection: unknown): RawWorkItemNotes {
  return {
    pages,
    connection,
    status: 200,
    failure: "none",
    connectionStatus: 200,
    connectionFailure: "none",
  };
}

/** A raw payload whose notes arrived but whose identity read did not. */
function rawReadWithoutIdentity(failure: RawWorkItemNotes["connectionFailure"], status: number) {
  return {
    ...rawRead([{ comments: [RAW_COMMENT] }], null),
    connectionFailure: failure,
    connectionStatus: status,
  };
}

/** A loader whose `send` resolves `response`, plus the logger it wrote through. */
function createLoader(response: LoadWorkItemNotesResponse | undefined) {
  const recorded = recordingLogger();
  const send = vi.fn(() => Promise.resolve(response));
  return { loader: new MessagingWorkItemNoteLoader(send, recorded.logger), send, ...recorded };
}

describe("MessagingWorkItemNoteLoader \u2014 the round trip", () => {
  it("asks the background worker for exactly the item and window it was given", async () => {
    const { loader, send } = createLoader({ raw: rawRead([], null) });

    await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(send).toHaveBeenCalledWith({
      type: LOAD_WORK_ITEM_NOTES_MESSAGE,
      workItemId: WORK_ITEM_ID,
      sinceIso: SINCE,
    });
  });

  it("parses the raw pages and the connection body into notes and the signed-in reader", async () => {
    const { loader } = createLoader({
      raw: rawRead([{ comments: [RAW_COMMENT] }], RAW_CONNECTION),
    });

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result.error).toBeNull();
    expect(result.notes).toEqual([
      {
        id: 1,
        workItemId: WORK_ITEM_ID,
        author: { displayName: AUTHOR_NAME, id: "guid-one", uniqueName: "alice@example.com" },
        createdDate: "2026-07-20T09:00:00Z",
        text: NOTE_TEXT,
        renderedHtml: `<p>${NOTE_TEXT}</p>`,
      },
    ]);
    expect(result.currentUser).toEqual({
      displayName: AUTHOR_NAME,
      id: "guid-one",
      uniqueName: "alice@example.com",
    });
  });

  it("reports an empty discussion as a success, not as a failure", async () => {
    const { loader } = createLoader({ raw: rawRead([{ comments: [] }], null) });

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result).toEqual({ notes: [], currentUser: null, error: null });
  });
});

describe("MessagingWorkItemNoteLoader — failures", () => {
  it("reports and records a worker that answered nothing at all", async () => {
    const { loader, error } = createLoader(undefined);

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result.notes).toEqual([]);
    expect(result.currentUser).toBeNull();
    // The worker answers even a malformed request with a reason, so silence can only mean it is not
    // running this code. Saying so is the difference between a dead end and something to act on.
    expect(result.error).toContain("did not handle the request");
    expect(result.error).toContain("reload the ADO tab");
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain(String(WORK_ITEM_ID));
  });

  it("keeps a failed read distinguishable from an empty one, carrying the worker's reason", async () => {
    const { loader, error } = createLoader({ raw: null, error: "HTTP 401" });

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result).toEqual({ notes: [], currentUser: null, error: "HTTP 401" });
    expect(String(error.mock.calls[0]?.[0])).toContain("HTTP 401");
  });

  it("catches and records a send that threw, rather than letting it reach the panel", async () => {
    const { error, logger } = recordingLogger();
    const thrown = new Error("receiving end does not exist");
    const loader = new MessagingWorkItemNoteLoader(() => Promise.reject(thrown), logger);

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result).toEqual({
      notes: [],
      currentUser: null,
      error: "could not reach Azure DevOps",
    });
    // The thrown value travels with the line so its stack is captured (AGENTS.md §9).
    expect(error).toHaveBeenCalledWith(expect.stringContaining("42"), thrown);
  });

  it("tells an expired session apart from an item that simply has no notes", async () => {
    const { loader, error } = createLoader({
      raw: { ...rawRead([], null), status: 200, failure: "sign-in" },
    });

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result.notes).toEqual([]);
    expect(result.error).toContain("sign-in");
    expect(String(error.mock.calls[0]?.[0])).toContain("sign-in");
  });

  it("reports a rejected read with the status Azure DevOps answered", async () => {
    const { loader } = createLoader({
      raw: { ...rawRead([], null), status: 403, failure: "http" },
    });

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result.error).toContain("403");
  });

  it("records a rejected IDENTITY read, which leaves a full panel with nothing editable", async () => {
    // The notes themselves arrived, so nothing on screen looks wrong — which is exactly why this
    // has to reach the log: it is the only trace of why no note offers an edit.
    const { loader, error } = createLoader({ raw: rawReadWithoutIdentity("http", 400) });

    const result = await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(result.error).toBeNull();
    expect(result.notes).toHaveLength(1);
    expect(result.currentUser).toBeNull();
    const line = String(error.mock.calls[0]?.[0]);
    expect(line).toContain("signed-in identity");
    expect(line).toContain("HTTP 400");
  });

  it("stays silent about the identity read when it succeeded", async () => {
    const { loader, error } = createLoader({
      raw: rawRead([{ comments: [RAW_COMMENT] }], RAW_CONNECTION),
    });

    await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    expect(error).not.toHaveBeenCalled();
  });
});

describe("MessagingWorkItemNoteLoader — what the diagnostics log may say", () => {
  it("records counts and the window, never a note's text or an author's name", async () => {
    const { loader, info, error } = createLoader({
      raw: rawRead([{ comments: [RAW_COMMENT] }], RAW_CONNECTION),
    });

    await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    const lines = loggedLines({ info, error });
    expect(lines.some((line) => line.includes("notes=1") && line.includes(SINCE))).toBe(true);
    // The log is exported into bug reports; a discussion routinely names people and customers.
    expect(lines.some((line) => line.includes(NOTE_TEXT) || line.includes(AUTHOR_NAME))).toBe(
      false,
    );
  });

  it("names no one even when the read failed, only the item and the reason", async () => {
    const { loader, info, error } = createLoader({ raw: null, error: "HTTP 401" });

    await loader.loadNotes({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });

    const lines = loggedLines({ info, error });
    expect(lines.some((line) => line.includes(NOTE_TEXT) || line.includes(AUTHOR_NAME))).toBe(
      false,
    );
  });
});
