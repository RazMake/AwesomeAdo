import { describe, expect, it } from "vitest";

import { MAX_NOTE_ACTIVITY_ITEMS } from "../ado/fetchNoteActivity";

import { READ_NOTE_ACTIVITY_MESSAGE, readNoteActivityMessageProblem } from "./NoteActivityRequest";

const valid = { type: READ_NOTE_ACTIVITY_MESSAGE, workItemIds: [1, 2, 3] };

describe("readNoteActivityMessageProblem", () => {
  it("accepts a well-formed request", () => {
    expect(readNoteActivityMessageProblem(valid)).toBeNull();
  });

  it("names what is wrong rather than answering a bare false", () => {
    // An ignored message reaches the content side as "no response from background", which looks
    // identical to a worker with no handler at all; the reason is what makes it a diagnosis.
    expect(readNoteActivityMessageProblem(null)).toContain("not an object");
    expect(readNoteActivityMessageProblem({ type: "something-else" })).toContain("type");
    expect(readNoteActivityMessageProblem({ ...valid, workItemIds: [] })).toContain("non-empty");
    expect(readNoteActivityMessageProblem({ ...valid, workItemIds: "1,2" })).toContain("non-empty");
  });

  it("refuses an id that could not be interpolated into a URL", () => {
    expect(readNoteActivityMessageProblem({ ...valid, workItemIds: [1, 0] })).toContain(
      "positive integer",
    );
    expect(readNoteActivityMessageProblem({ ...valid, workItemIds: [1, 2.5] })).toContain(
      "positive integer",
    );
    expect(readNoteActivityMessageProblem({ ...valid, workItemIds: [1, "2"] })).toContain(
      "positive integer",
    );
  });

  it("refuses a list past the ceiling, so one message cannot fan out without bound", () => {
    const tooMany = Array.from({ length: MAX_NOTE_ACTIVITY_ITEMS + 1 }, (_, index) => index + 1);

    expect(readNoteActivityMessageProblem({ ...valid, workItemIds: tooMany })).toContain("ceiling");
  });
});
