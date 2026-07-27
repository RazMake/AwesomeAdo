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
  const row = renderNoteRow(document, { note, currentUser, mentionNames, onEdit });
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
});

describe("renderNoteRow — correcting a note in place", () => {
  it("opens the editor on the note's SOURCE, not on ADO's rendering of it", () => {
    // Re-opening the rendered form would rewrite the author's Markdown into HTML on first typo fix.
    const note = createNote(READER, { renderedHtml: "<p><strong>Blocked</strong> on it.</p>" });
    const { row } = renderRow(note, READER);

    authorOf(row).click();

    expect(row.querySelector<HTMLTextAreaElement>(".awesomeado-note-editor__input")?.value).toBe(
      "**Blocked** on the schema review.",
    );
  });

  it("swaps the whole row for the editor, so the correction happens where the note is", () => {
    const { row } = renderRow(createNote(READER), READER);

    authorOf(row).click();

    expect(row.querySelector(".awesomeado-note__text")).toBeNull();
    expect(row.querySelector(".awesomeado-note-editor")).not.toBeNull();
  });

  it("puts the note back exactly as it was when the edit is abandoned", () => {
    const { row } = renderRow(createNote(READER), READER);
    authorOf(row).click();

    const cancel = [...row.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    cancel?.click();

    expect(row.querySelector(".awesomeado-note-editor")).toBeNull();
    expect(authorOf(row).textContent).toBe("Alice Smith");
    expect(row.querySelector(".awesomeado-note__text")?.textContent).toContain(
      "Blocked on the schema review.",
    );
  });

  it("persists the corrected text through the caller's hook", () => {
    const { row, onEdit } = renderRow(createNote(READER), READER);
    authorOf(row).click();
    row.querySelector<HTMLTextAreaElement>(".awesomeado-note-editor__input")!.value =
      "Unblocked now.";

    const save = [...row.querySelectorAll("button")].find(
      (button) => button.textContent === "Save",
    );
    save?.click();

    expect(onEdit).toHaveBeenCalledWith("Unblocked now.");
  });
});
