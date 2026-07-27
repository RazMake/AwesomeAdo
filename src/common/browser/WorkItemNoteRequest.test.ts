import { describe, expect, it } from "vitest";

import { MAX_NOTE_LENGTH } from "../ado/WorkItemNote";

import {
  claimsMessageType,
  isLoadWorkItemNotesMessage,
  isWriteWorkItemNoteMessage,
  LOAD_WORK_ITEM_NOTES_MESSAGE,
  loadNotesMessageProblem,
  WRITE_WORK_ITEM_NOTE_MESSAGE,
  writeNoteMessageProblem,
} from "./WorkItemNoteRequest";

/** A well-formed load request, overridable per case. */
function loadMessage(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: LOAD_WORK_ITEM_NOTES_MESSAGE,
    workItemId: 42,
    sinceIso: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

/** A well-formed write request, overridable per case. */
function writeMessage(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: WRITE_WORK_ITEM_NOTE_MESSAGE,
    workItemId: 42,
    noteId: null,
    text: "A note.",
    ...overrides,
  };
}

describe("isLoadWorkItemNotesMessage", () => {
  it("accepts a well-formed load request", () => {
    expect(isLoadWorkItemNotesMessage(loadMessage())).toBe(true);
  });

  it("rejects anything that is not an object", () => {
    expect(isLoadWorkItemNotesMessage(null)).toBe(false);
    expect(isLoadWorkItemNotesMessage(undefined)).toBe(false);
    expect(isLoadWorkItemNotesMessage("load")).toBe(false);
    expect(isLoadWorkItemNotesMessage(42)).toBe(false);
  });

  it("rejects another extension message that merely carries the same fields", () => {
    expect(isLoadWorkItemNotesMessage(loadMessage({ type: "awesomeado:something-else" }))).toBe(
      false,
    );
    expect(isLoadWorkItemNotesMessage(loadMessage({ type: undefined }))).toBe(false);
  });

  it("rejects a work item id that could not be interpolated into a URL", () => {
    // The worker builds the request URL from this value, so anything but a positive whole number is
    // refused before it can reach the URL.
    expect(isLoadWorkItemNotesMessage(loadMessage({ workItemId: 0 }))).toBe(false);
    expect(isLoadWorkItemNotesMessage(loadMessage({ workItemId: -1 }))).toBe(false);
    expect(isLoadWorkItemNotesMessage(loadMessage({ workItemId: 1.5 }))).toBe(false);
    expect(isLoadWorkItemNotesMessage(loadMessage({ workItemId: "42" }))).toBe(false);
    expect(isLoadWorkItemNotesMessage(loadMessage({ workItemId: Number.NaN }))).toBe(false);
  });

  it("rejects a window start the worker could not compare page entries against", () => {
    expect(isLoadWorkItemNotesMessage(loadMessage({ sinceIso: "whenever" }))).toBe(false);
    expect(isLoadWorkItemNotesMessage(loadMessage({ sinceIso: "" }))).toBe(false);
    expect(isLoadWorkItemNotesMessage(loadMessage({ sinceIso: 1752105600000 }))).toBe(false);
  });
});

describe("isWriteWorkItemNoteMessage — accepted shapes", () => {
  it("accepts a new note (no comment id)", () => {
    expect(isWriteWorkItemNoteMessage(writeMessage())).toBe(true);
  });

  it("accepts a correction addressed to an existing comment", () => {
    expect(isWriteWorkItemNoteMessage(writeMessage({ noteId: 7 }))).toBe(true);
  });

  it("accepts a note exactly at the longest length this extension will author", () => {
    expect(isWriteWorkItemNoteMessage(writeMessage({ text: "x".repeat(MAX_NOTE_LENGTH) }))).toBe(
      true,
    );
  });
});

describe("isWriteWorkItemNoteMessage — refused shapes", () => {
  it("rejects anything that is not an object", () => {
    expect(isWriteWorkItemNoteMessage(null)).toBe(false);
    expect(isWriteWorkItemNoteMessage(undefined)).toBe(false);
    expect(isWriteWorkItemNoteMessage("write")).toBe(false);
  });

  it("rejects a message tagged as something else", () => {
    expect(isWriteWorkItemNoteMessage(writeMessage({ type: LOAD_WORK_ITEM_NOTES_MESSAGE }))).toBe(
      false,
    );
  });

  it("rejects a work item id that could not be interpolated into a URL", () => {
    expect(isWriteWorkItemNoteMessage(writeMessage({ workItemId: 0 }))).toBe(false);
    expect(isWriteWorkItemNoteMessage(writeMessage({ workItemId: 2.5 }))).toBe(false);
    expect(isWriteWorkItemNoteMessage(writeMessage({ workItemId: "42" }))).toBe(false);
  });

  it("rejects a comment id that is neither absent nor a real id", () => {
    expect(isWriteWorkItemNoteMessage(writeMessage({ noteId: 0 }))).toBe(false);
    expect(isWriteWorkItemNoteMessage(writeMessage({ noteId: -3 }))).toBe(false);
    expect(isWriteWorkItemNoteMessage(writeMessage({ noteId: "7" }))).toBe(false);
    expect(isWriteWorkItemNoteMessage(writeMessage({ noteId: undefined }))).toBe(false);
  });

  it("rejects a note with nothing in it", () => {
    expect(isWriteWorkItemNoteMessage(writeMessage({ text: "" }))).toBe(false);
    expect(isWriteWorkItemNoteMessage(writeMessage({ text: "   \n\t " }))).toBe(false);
    expect(isWriteWorkItemNoteMessage(writeMessage({ text: 7 }))).toBe(false);
  });

  it("rejects a note longer than the bound the composer stops at", () => {
    expect(
      isWriteWorkItemNoteMessage(writeMessage({ text: "x".repeat(MAX_NOTE_LENGTH + 1) })),
    ).toBe(false);
  });
});

describe("claimsMessageType", () => {
  it("claims a message carrying the type, however malformed the rest of it is", () => {
    // The whole point: a listener must OWN a message of its own kind even when it is unusable, so it
    // can answer with the reason instead of ignoring it into "no response from background".
    expect(
      claimsMessageType({ type: LOAD_WORK_ITEM_NOTES_MESSAGE }, LOAD_WORK_ITEM_NOTES_MESSAGE),
    ).toBe(true);
    expect(
      claimsMessageType(
        { type: LOAD_WORK_ITEM_NOTES_MESSAGE, workItemId: -1 },
        LOAD_WORK_ITEM_NOTES_MESSAGE,
      ),
    ).toBe(true);
  });

  it("leaves another handler's message, and anything that is not a message, alone", () => {
    expect(
      claimsMessageType({ type: WRITE_WORK_ITEM_NOTE_MESSAGE }, LOAD_WORK_ITEM_NOTES_MESSAGE),
    ).toBe(false);
    expect(claimsMessageType(null, LOAD_WORK_ITEM_NOTES_MESSAGE)).toBe(false);
    expect(claimsMessageType("a string", LOAD_WORK_ITEM_NOTES_MESSAGE)).toBe(false);
  });
});

describe("loadNotesMessageProblem", () => {
  it("finds no problem with a well-formed request", () => {
    expect(loadNotesMessageProblem(loadMessage())).toBeNull();
  });

  it("names the offending field, so a rejection is a diagnosis rather than silence", () => {
    expect(loadNotesMessageProblem(loadMessage({ workItemId: 0 }))).toContain("workItemId");
    expect(loadNotesMessageProblem(loadMessage({ sinceIso: "whenever" }))).toContain("sinceIso");
    expect(loadNotesMessageProblem({ type: "something-else" })).toContain("type");
    expect(loadNotesMessageProblem(null)).toContain("not an object");
  });
});

describe("writeNoteMessageProblem", () => {
  it("finds no problem with a well-formed request", () => {
    expect(writeNoteMessageProblem(writeMessage())).toBeNull();
    expect(writeNoteMessageProblem(writeMessage({ noteId: 7 }))).toBeNull();
  });

  it("names the offending field", () => {
    expect(writeNoteMessageProblem(writeMessage({ workItemId: 1.5 }))).toContain("workItemId");
    expect(writeNoteMessageProblem(writeMessage({ noteId: 0 }))).toContain("noteId");
    expect(writeNoteMessageProblem(writeMessage({ text: "  " }))).toContain("text");
    expect(writeNoteMessageProblem({ type: "something-else" })).toContain("type");
  });

  it("reports an over-long note by its LENGTH, never by quoting what it said", () => {
    const secret = "Contoso escalation".repeat(MAX_NOTE_LENGTH);
    const problem = writeNoteMessageProblem(writeMessage({ text: secret }));

    // This reason is written to the diagnostics log, which is exported into bug reports.
    expect(problem).toContain(String(secret.length));
    expect(problem).not.toContain("Contoso");
  });
});
