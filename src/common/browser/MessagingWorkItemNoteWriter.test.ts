import { describe, expect, it, vi, type Mock } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { MessagingWorkItemNoteWriter } from "./MessagingWorkItemNoteWriter";
import {
  WRITE_WORK_ITEM_NOTE_MESSAGE,
  type WriteWorkItemNoteResponse,
} from "./WorkItemNoteRequest";

const WORK_ITEM_ID = 42;
const NOTE_ID = 7;
const NOTE_TEXT = "Customer escalation from Contoso.";
const AUTHOR_NAME = "Alice Smith";

/** The comment ADO echoes back after storing a note. */
const SAVED_COMMENT = {
  id: NOTE_ID,
  createdDate: "2026-07-24T12:00:00Z",
  createdBy: { displayName: AUTHOR_NAME, id: "guid-one", uniqueName: "alice@example.com" },
  text: NOTE_TEXT,
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

/** A writer whose `send` resolves `response`, plus the mocks it wrote through. */
function createWriter(response: WriteWorkItemNoteResponse | undefined) {
  const recorded = recordingLogger();
  const send = vi.fn(() => Promise.resolve(response));
  return { writer: new MessagingWorkItemNoteWriter(send, recorded.logger), send, ...recorded };
}

describe("MessagingWorkItemNoteWriter — message shapes", () => {
  it("names no comment id when posting a new note", async () => {
    const { writer, send } = createWriter({ ok: true, raw: SAVED_COMMENT });

    await writer.addNote({ workItemId: WORK_ITEM_ID, text: NOTE_TEXT });

    expect(send).toHaveBeenCalledWith({
      type: WRITE_WORK_ITEM_NOTE_MESSAGE,
      workItemId: WORK_ITEM_ID,
      noteId: null,
      text: NOTE_TEXT,
    });
  });

  it("addresses a correction to the comment being rewritten", async () => {
    const { writer, send } = createWriter({ ok: true, raw: SAVED_COMMENT });

    await writer.editNote({ workItemId: WORK_ITEM_ID, noteId: NOTE_ID, text: NOTE_TEXT });

    expect(send).toHaveBeenCalledWith({
      type: WRITE_WORK_ITEM_NOTE_MESSAGE,
      workItemId: WORK_ITEM_ID,
      noteId: NOTE_ID,
      text: NOTE_TEXT,
    });
  });
});

describe("MessagingWorkItemNoteWriter — outcomes", () => {
  it("hands back the note exactly as Azure DevOps stored it", async () => {
    const { writer } = createWriter({ ok: true, raw: SAVED_COMMENT });

    const result = await writer.addNote({ workItemId: WORK_ITEM_ID, text: NOTE_TEXT });

    expect(result).toEqual({
      ok: true,
      note: {
        id: NOTE_ID,
        workItemId: WORK_ITEM_ID,
        author: { displayName: AUTHOR_NAME, id: "guid-one", uniqueName: "alice@example.com" },
        createdDate: "2026-07-24T12:00:00Z",
        text: NOTE_TEXT,
        renderedHtml: null,
      },
    });
  });

  it("still reports success for a note ADO accepted but described back unparseably", async () => {
    // The note IS saved; claiming otherwise would tell the author their stored words were lost.
    const { writer } = createWriter({ ok: true, raw: { nothing: "useful" } });

    const result = await writer.addNote({ workItemId: WORK_ITEM_ID, text: NOTE_TEXT });

    expect(result).toEqual({ ok: true, note: undefined });
  });

  it("passes on the revision the note created, so the caller's next edit is not a conflict", async () => {
    const { writer } = createWriter({ ok: true, raw: SAVED_COMMENT, rev: 13 });

    const result = await writer.addNote({ workItemId: WORK_ITEM_ID, text: NOTE_TEXT });

    expect(result.rev).toBe(13);
  });

  it("reports and records a write Azure DevOps refused", async () => {
    const { writer, error } = createWriter({ ok: false, error: "HTTP 403" });

    const result = await writer.editNote({
      workItemId: WORK_ITEM_ID,
      noteId: NOTE_ID,
      text: NOTE_TEXT,
    });

    expect(result).toEqual({ ok: false, error: "HTTP 403" });
    expect(String(error.mock.calls[0]?.[0])).toContain("HTTP 403");
  });

  it("reports and records a worker that answered nothing at all", async () => {
    const { writer, error } = createWriter(undefined);

    const result = await writer.addNote({ workItemId: WORK_ITEM_ID, text: NOTE_TEXT });

    expect(result.ok).toBe(false);
    // Names what silence actually means — the worker answers even a malformed request with a reason.
    expect(result.error).toContain("did not handle the request");
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("catches and records a send that threw, rather than letting it reach the editor", async () => {
    const { error, logger } = recordingLogger();
    const thrown = new Error("receiving end does not exist");
    const writer = new MessagingWorkItemNoteWriter(() => Promise.reject(thrown), logger);

    const result = await writer.addNote({ workItemId: WORK_ITEM_ID, text: NOTE_TEXT });

    expect(result).toEqual({ ok: false, error: "could not reach Azure DevOps" });
    // The thrown value travels with the line so its stack is captured (AGENTS.md §9).
    expect(error).toHaveBeenCalledWith(expect.stringContaining(String(WORK_ITEM_ID)), thrown);
  });
});

describe("MessagingWorkItemNoteWriter — what the diagnostics log may say", () => {
  it("records the operation and the item, never the note's text", async () => {
    const { writer, info, error } = createWriter({ ok: true, raw: SAVED_COMMENT });

    await writer.addNote({ workItemId: WORK_ITEM_ID, text: NOTE_TEXT });

    const lines = loggedLines({ info, error });
    expect(lines.some((line) => line.includes(String(WORK_ITEM_ID)))).toBe(true);
    // The log is exported into bug reports; a note routinely names people and customers.
    expect(lines.some((line) => line.includes(NOTE_TEXT) || line.includes(AUTHOR_NAME))).toBe(
      false,
    );
  });

  it("keeps the text out of the log on the failure path too", async () => {
    const { writer, info, error } = createWriter({ ok: false, error: "HTTP 403" });

    await writer.editNote({ workItemId: WORK_ITEM_ID, noteId: NOTE_ID, text: NOTE_TEXT });

    const lines = loggedLines({ info, error });
    expect(lines.some((line) => line.includes(NOTE_TEXT))).toBe(false);
  });
});
