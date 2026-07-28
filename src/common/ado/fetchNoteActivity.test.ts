import { describe, expect, it } from "vitest";

import { buildNewestNoteUrl, parseNewestNoteDate } from "./fetchNoteActivity";

const ADO_HREF = "https://dev.azure.com/contoso/MyProject/_queries/query/abc";

describe("buildNewestNoteUrl", () => {
  it("asks for the newest comment only, without ADO's rendering of it", () => {
    const url = buildNewestNoteUrl(ADO_HREF, 42);

    expect(url).toContain("/contoso/MyProject/_apis/wit/workItems/42/comments");
    // The board wants a DATE: one comment, newest first, and none of the rendered HTML the notes
    // panel needs.
    expect(url).toContain("$top=1");
    expect(url).toContain("order=desc");
    expect(url).not.toContain("$expand");
  });

  it("returns null when the page is not a project-scoped ADO location", () => {
    expect(buildNewestNoteUrl("https://example.com/whatever", 42)).toBeNull();
  });
});

describe("parseNewestNoteDate", () => {
  it("reads the newest comment's date", () => {
    const page = { comments: [{ createdDate: "2026-07-24T09:00:00Z" }] };

    expect(parseNewestNoteDate(page)).toBe("2026-07-24T09:00:00Z");
  });

  it("answers null for an item nobody has commented on", () => {
    expect(parseNewestNoteDate({ comments: [] })).toBeNull();
  });

  it("answers null rather than throwing on a body it does not recognize", () => {
    // This runs across every commented item on a board; one odd response must not lose the rest.
    expect(parseNewestNoteDate(null)).toBeNull();
    expect(parseNewestNoteDate({})).toBeNull();
    expect(parseNewestNoteDate({ comments: "nope" })).toBeNull();
    expect(parseNewestNoteDate({ comments: [{}] })).toBeNull();
    expect(parseNewestNoteDate({ comments: [{ createdDate: "whenever" }] })).toBeNull();
  });
});
