import { describe, expect, it } from "vitest";

import {
  buildAddNoteUrl,
  buildEditNoteUrl,
  buildWorkItemNotesUrls,
  parseWorkItemNote,
  parseWorkItemNotes,
} from "./fetchWorkItemNotes";

/** A project-scoped ADO query page: `dev.azure.com/{org}/{project}/…`, which is what the URL builders need. */
const HREF =
  "https://dev.azure.com/myorg/myproject/_queries/query/2f6a1b4c-0000-4a11-9f00-abcdef012345";
/** An org-level ADO location: a real ADO host, but with no project segment to scope an API call to. */
const ORG_HREF = "https://dev.azure.com/myorg/_queries";
const NOT_ADO = "https://example.com/x";

const WORK_ITEM_ID = 42;
const API_BASE = "https://dev.azure.com/myorg/myproject/_apis/wit/workItems/42/comments";

describe("buildWorkItemNotesUrls", () => {
  it("reads the discussion newest-first, with ADO's own rendering of each comment", () => {
    const urls = buildWorkItemNotesUrls(HREF, WORK_ITEM_ID);

    // renderedText is what resolves an @-mention to a name; order=desc is what lets the fetcher stop
    // paging at the window; $top asks for the largest page ADO will serve.
    expect(urls?.commentsUrl).toBe(
      `${API_BASE}?api-version=7.1-preview.4&$top=200&order=desc&$expand=renderedText`,
    );
  });

  it("reads the signed-in identity from the ORG, not from the project", () => {
    expect(buildWorkItemNotesUrls(HREF, WORK_ITEM_ID)?.connectionUrl).toBe(
      "https://dev.azure.com/myorg/_apis/ConnectionData?api-version=7.1-preview.1",
    );
  });

  it("asks ConnectionData for a PREVIEW version, the only kind it is served under", () => {
    // A released version answers 400 there, which reaches the parser as an error envelope with no
    // authenticatedUser — indistinguishable from "nobody is signed in", and it silently made every
    // note read-only. Asserted separately from the exact URL so the requirement survives a re-pin.
    expect(buildWorkItemNotesUrls(HREF, WORK_ITEM_ID)?.connectionUrl).toMatch(
      /api-version=\d+\.\d+-preview(\.\d+)?$/,
    );
  });

  it("builds no URLs for a location that is not Azure DevOps", () => {
    expect(buildWorkItemNotesUrls(NOT_ADO, WORK_ITEM_ID)).toBeNull();
  });

  it("builds no URLs for an ADO location that names no project", () => {
    expect(buildWorkItemNotesUrls(ORG_HREF, WORK_ITEM_ID)).toBeNull();
  });
});

describe("buildAddNoteUrl and buildEditNoteUrl", () => {
  it("posts a new note as Markdown, through the version that honours the format", () => {
    expect(buildAddNoteUrl(HREF, WORK_ITEM_ID)).toBe(
      `${API_BASE}?format=0&api-version=7.2-preview.4`,
    );
  });

  it("addresses an edit to the comment id, keeping the Markdown format and write version", () => {
    expect(buildEditNoteUrl(HREF, WORK_ITEM_ID, 7)).toBe(
      `${API_BASE}/7?format=0&api-version=7.2-preview.4`,
    );
  });

  it("builds no write URL for a location that is not project-scoped", () => {
    expect(buildAddNoteUrl(NOT_ADO, WORK_ITEM_ID)).toBeNull();
    expect(buildEditNoteUrl(NOT_ADO, WORK_ITEM_ID, 7)).toBeNull();
    expect(buildAddNoteUrl(ORG_HREF, WORK_ITEM_ID)).toBeNull();
    expect(buildEditNoteUrl(ORG_HREF, WORK_ITEM_ID, 7)).toBeNull();
  });
});

/** One raw ADO comment, overridable per case. */
function rawComment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    createdDate: "2026-07-24T12:00:00Z",
    createdBy: { displayName: "Alice Smith", id: "guid-one", uniqueName: "alice@example.com" },
    text: "A note.",
    ...overrides,
  };
}

describe("parseWorkItemNotes", () => {
  const since = "2026-07-10T00:00:00Z";

  it("drops an entry posted before the Updates window started", () => {
    const pages = [
      {
        comments: [
          rawComment({ id: 1 }),
          rawComment({ id: 2, createdDate: "2026-06-01T00:00:00Z" }),
        ],
      },
    ];

    expect(parseWorkItemNotes(pages, WORK_ITEM_ID, since).map((note) => note.id)).toEqual([1]);
  });

  it("keeps an entry posted exactly at the window boundary", () => {
    const pages = [{ comments: [rawComment({ id: 1, createdDate: since })] }];

    expect(parseWorkItemNotes(pages, WORK_ITEM_ID, since).map((note) => note.id)).toEqual([1]);
  });

  it("tolerates a page that carries no comments array", () => {
    const pages = [{ count: 0 }, null, "garbage", { comments: [rawComment({ id: 3 })] }];

    expect(parseWorkItemNotes(pages, WORK_ITEM_ID, since).map((note) => note.id)).toEqual([3]);
  });

  it("walks every page it was handed, in order", () => {
    const pages = [
      { comments: [rawComment({ id: 1 }), rawComment({ id: 2 })] },
      { comments: [rawComment({ id: 3 })] },
    ];

    expect(parseWorkItemNotes(pages, WORK_ITEM_ID, since).map((note) => note.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it("keeps every entry when the window start itself is unreadable", () => {
    const pages = [{ comments: [rawComment({ id: 1, createdDate: "2019-01-01T00:00:00Z" })] }];

    expect(parseWorkItemNotes(pages, WORK_ITEM_ID, "whenever").map((note) => note.id)).toEqual([1]);
  });

  it("files every note under the item it was asked about", () => {
    const pages = [{ comments: [rawComment({ id: 1, workItemId: 999 })] }];

    expect(parseWorkItemNotes(pages, WORK_ITEM_ID, since)[0]?.workItemId).toBe(WORK_ITEM_ID);
  });
});

describe("parseWorkItemNote", () => {
  it("parses a full comment into the view's model", () => {
    const parsed = parseWorkItemNote(rawComment({ renderedText: "<p>A note.</p>" }), WORK_ITEM_ID);

    expect(parsed).toEqual({
      id: 1,
      workItemId: WORK_ITEM_ID,
      author: { displayName: "Alice Smith", id: "guid-one", uniqueName: "alice@example.com" },
      createdDate: "2026-07-24T12:00:00Z",
      text: "A note.",
      renderedHtml: "<p>A note.</p>",
    });
  });

  it("refuses a comment with no numeric id, since an edit has nothing to address", () => {
    expect(parseWorkItemNote(rawComment({ id: "1" }), WORK_ITEM_ID)).toBeNull();
    expect(parseWorkItemNote(rawComment({ id: undefined }), WORK_ITEM_ID)).toBeNull();
    expect(parseWorkItemNote(null, WORK_ITEM_ID)).toBeNull();
    expect(parseWorkItemNote("comment", WORK_ITEM_ID)).toBeNull();
  });

  it("refuses a comment whose date the list could not order by", () => {
    expect(parseWorkItemNote(rawComment({ createdDate: "" }), WORK_ITEM_ID)).toBeNull();
    expect(parseWorkItemNote(rawComment({ createdDate: "whenever" }), WORK_ITEM_ID)).toBeNull();
    expect(parseWorkItemNote(rawComment({ createdDate: undefined }), WORK_ITEM_ID)).toBeNull();
  });

  it("reports no rendering when ADO supplied none, so the source is rendered instead", () => {
    expect(parseWorkItemNote(rawComment(), WORK_ITEM_ID)?.renderedHtml).toBeNull();
    expect(
      parseWorkItemNote(rawComment({ renderedText: "" }), WORK_ITEM_ID)?.renderedHtml,
    ).toBeNull();
    expect(
      parseWorkItemNote(rawComment({ renderedText: 7 }), WORK_ITEM_ID)?.renderedHtml,
    ).toBeNull();
  });

  it("degrades an unknown author to blank handles rather than to a shared empty identity", () => {
    // An EMPTY address must not survive as a handle: two anonymous authors would then match.
    const parsed = parseWorkItemNote(
      rawComment({ createdBy: { displayName: "", id: "", uniqueName: "" }, text: 5 }),
      WORK_ITEM_ID,
    );

    expect(parsed?.author).toEqual({ displayName: "", id: null, uniqueName: null });
    expect(parsed?.text).toBe("");
  });
});
