import { describe, expect, it, vi } from "vitest";

import type { NoteAuthor, WorkItemNote } from "../../../../common/ado/WorkItemNote";

import { renderNoteRow } from "./NoteRow";

const READER: NoteAuthor = {
  displayName: "Alice Smith",
  id: "guid-alice",
  uniqueName: "alice@example.com",
};

const SOMEONE_ELSE: NoteAuthor = {
  displayName: "Bob Jones",
  id: "guid-bob",
  uniqueName: "bob@example.com",
};

/** A note by `author`, carrying Markdown source so the rendered form is visibly different. */
function createNote(author: NoteAuthor, overrides: Partial<WorkItemNote> = {}): WorkItemNote {
  return {
    id: 1,
    workItemId: 42,
    author,
    createdDate: "2026-07-24T19:00:00Z",
    text: "**Blocked** on the schema review.",
    renderedHtml: null,
    ...overrides,
  };
}

/** A row over `note`, read by `currentUser`, plus the edit hook it was given. */
function renderRow(
  note: WorkItemNote,
  currentUser: NoteAuthor | null,
  mentionNames: ReadonlyMap<string, string> = new Map(),
) {
  const onEdit = vi.fn(() => Promise.resolve(true));
  const row = renderNoteRow(document, {
    note,
    currentUser,
    mentionNames,
    mentions: {
      userDirectory: {
        search: vi.fn(() => Promise.resolve([])),
        resolve: vi.fn(() => Promise.resolve(null)),
      },
      logger: { info: vi.fn(), error: vi.fn() },
    },
    onEdit,
  });
  return { row, onEdit };
}

/** The row's author element, whichever form it took. */
function authorOf(row: HTMLElement): HTMLElement {
  return row.querySelector<HTMLElement>(".awesomeado-note__author")!;
}

describe("renderNoteRow — @-mentions", () => {
  const ADA = "11111111-2222-3333-4444-555555555555";

  it("names the person behind a mention ADO did not render for us", () => {
    // A note ADO returned no `renderedText` for falls back to the raw Markdown, where a mention is a
    // bare GUID — exactly the case the bulk directory exists to cover.
    const note = createNote(SOMEONE_ELSE, { text: `Handing this to @<${ADA}>.` });
    const { row } = renderRow(note, READER, new Map([[ADA, "Ada Lovelace"]]));

    expect(row.querySelector(".awesomeado-markdown__mention")?.textContent).toBe("@Ada Lovelace");
  });

  it("keeps the neutral placeholder when the mention resolved to nobody", () => {
    const note = createNote(SOMEONE_ELSE, { text: `Handing this to @<${ADA}>.` });
    const { row } = renderRow(note, READER);

    expect(row.querySelector(".awesomeado-markdown__mention")?.textContent).toBe("@mention");
    expect(row.textContent).not.toContain(ADA);
  });
});

describe("renderNoteRow — what one note shows", () => {
  it("reads as author, date, then the note itself", () => {
    const { row } = renderRow(createNote(SOMEONE_ELSE), READER);

    expect(authorOf(row).textContent).toBe("Bob Jones");
    expect(row.querySelector(".awesomeado-date")).not.toBeNull();
    expect(row.querySelector(".awesomeado-note__text")?.textContent).toContain(
      "Blocked on the schema review.",
    );
  });

  it("renders the Markdown rather than showing its markers", () => {
    const { row } = renderRow(createNote(SOMEONE_ELSE), READER);

    expect(row.querySelector(".awesomeado-note__text strong")?.textContent).toBe("Blocked");
  });

  it("names an author the directory could not describe rather than leaving a blank", () => {
    const anonymous: NoteAuthor = { displayName: "", id: "guid-nobody", uniqueName: null };

    const { row } = renderRow(createNote(anonymous), READER);

    expect(authorOf(row).textContent).toBe("Unknown");
  });

  it("tints the note in a warm shade derived from the theme's own text color", () => {
    const { row } = renderRow(createNote(SOMEONE_ELSE), READER);

    // Asserted on the raw attribute: the mix has to stay anchored to the theme token, since that is
    // what keeps it legible on light and dark alike rather than only wherever it was eyeballed.
    expect(row.getAttribute("style")).toContain("--text-primary-color");
    expect(row.getAttribute("style")).toContain("--note-foreground");
  });

  it("reads on one line, with wrapped lines hanging in under the name", () => {
    const { row } = renderRow(createNote(SOMEONE_ELSE), READER);

    // The author/date block floats, so the note's FIRST line runs beside it instead of starting a
    // line of its own; everything that wraps past it falls back to a small indent, which is what
    // makes a two-line note read as one entry rather than as two.
    const header = row.querySelector<HTMLElement>(".awesomeado-note__header")!;
    expect(header.style.float).toBe("left");
    expect(header.style.marginRight).toBe("8px");
    expect(row.querySelector<HTMLElement>(".awesomeado-note__text")!.style.paddingLeft).toBe(
      "12px",
    );
    // Without a containment context the float would spill onto the next note in the panel.
    expect(row.style.display).toBe("flow-root");
  });
});

describe("renderNoteRow — who may correct a note", () => {
  it("leaves someone else's name as plain text, since ADO would refuse the edit", () => {
    const { row } = renderRow(createNote(SOMEONE_ELSE), READER);

    expect(authorOf(row).tagName).toBe("SPAN");
  });

  it("leaves every name plain when the reader could not be identified", () => {
    const { row } = renderRow(createNote(READER), null);

    expect(authorOf(row).tagName).toBe("SPAN");
  });

  it("turns the reader's own name into the edit affordance", () => {
    const { row } = renderRow(createNote(READER), READER);

    expect(authorOf(row).tagName).toBe("BUTTON");
    expect(authorOf(row).title).toBe("Edit this note");
  });

  it("marks the reader's own name as clickable with a hand and a broken underline", () => {
    const { row } = renderRow(createNote(READER), READER);

    // The affordance has to be visible BEFORE the pointer is over the name, so the underline carries
    // it; broken rather than solid, because this opens the note in place instead of navigating.
    const author = authorOf(row);
    expect(author.style.cursor).toBe("pointer");
    expect(author.style.textDecorationLine).toBe("underline");
    expect(author.style.textDecorationStyle).toBe("dashed");
  });

  it("leaves someone else's name without any clickable styling", () => {
    const { row } = renderRow(createNote(SOMEONE_ELSE), READER);

    const author = authorOf(row);
    expect(author.style.cursor).toBe("");
    expect(author.getAttribute("style")).not.toContain("underline");
  });
});

describe("renderNoteRow — correcting a note in place", () => {
  it("opens the editor on the note's SOURCE, not on ADO's rendering of it", () => {
    // Re-opening the rendered form would rewrite the author's Markdown into HTML on first typo fix.
    const note = createNote(READER, { renderedHtml: "<p><strong>Blocked</strong> on it.</p>" });
    const { row } = renderRow(note, READER);

    authorOf(row).click();

    expect(row.querySelector<HTMLTextAreaElement>(".awesomeado-text-editor__input")?.value).toBe(
      "**Blocked** on the schema review.",
    );
  });

  it("swaps the whole row for the editor, so the correction happens where the note is", () => {
    const { row } = renderRow(createNote(READER), READER);

    authorOf(row).click();

    expect(row.querySelector(".awesomeado-note__text")).toBeNull();
    expect(row.querySelector(".awesomeado-text-editor")).not.toBeNull();
  });

  it("puts the note back exactly as it was when the edit is abandoned", () => {
    const { row } = renderRow(createNote(READER), READER);
    authorOf(row).click();

    const cancel = [...row.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    cancel?.click();

    expect(row.querySelector(".awesomeado-text-editor")).toBeNull();
    expect(authorOf(row).textContent).toBe("Alice Smith");
    expect(row.querySelector(".awesomeado-note__text")?.textContent).toContain(
      "Blocked on the schema review.",
    );
  });

  it("persists the corrected text through the caller's hook", () => {
    const { row, onEdit } = renderRow(createNote(READER), READER);
    authorOf(row).click();
    row.querySelector<HTMLTextAreaElement>(".awesomeado-text-editor__input")!.value =
      "Unblocked now.";

    const save = [...row.querySelectorAll("button")].find(
      (button) => button.textContent === "Save",
    );
    save?.click();

    expect(onEdit).toHaveBeenCalledWith("Unblocked now.");
  });
});
