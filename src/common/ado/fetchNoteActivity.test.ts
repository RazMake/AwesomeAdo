import { describe, expect, it } from "vitest";

import {
  buildNewestNoteUrl,
  NOTE_ACTIVITY_PAGE_SIZE,
  parseNewestNoteDate,
} from "./fetchNoteActivity";

const ADO_HREF = "https://dev.azure.com/contoso/MyProject/_queries/query/abc";

describe("buildNewestNoteUrl", () => {
  it("asks for one newest-first source page without ADO's rendering", () => {
    const url = buildNewestNoteUrl(ADO_HREF, 42);

    expect(url).toContain("/contoso/MyProject/_apis/wit/workItems/42/comments");
    // Source text identifies marker-generated notes; rendered HTML would only add payload.
    expect(url).toContain(`$top=${NOTE_ACTIVITY_PAGE_SIZE}`);
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
