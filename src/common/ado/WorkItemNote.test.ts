import { describe, expect, it } from "vitest";

import {
  isOwnNote,
  noteWindowStart,
  selectRecentNoteDays,
  sortNotesNewestFirst,
  type NoteAuthor,
  type WorkItemNote,
} from "./WorkItemNote";

/**
 * An ISO timestamp for a LOCAL wall-clock moment.
 *
 * The two-day rule is defined in the READER's zone, so a fixture written as a fixed UTC instant
 * would land on a different local day depending on where the suite runs. Building from local parts
 * keeps "which day is this?" identical in every timezone.
 */
function localIso(day: number, hour: number): string {
  return new Date(2026, 6, day, hour, 0, 0).toISOString();
}

/** A note carrying the fixture defaults every case shares, overridable per test. */
function createNote(overrides: Partial<WorkItemNote> & { id: number }): WorkItemNote {
  return {
    workItemId: 42,
    author: { displayName: "Alice Smith", id: null, uniqueName: "alice@example.com" },
    createdDate: localIso(24, 12),
    text: "A note.",
    renderedHtml: null,
    ...overrides,
  };
}

/** An author with only the handles a case cares about; the rest default to "not supplied". */
function createAuthor(overrides: Partial<NoteAuthor> = {}): NoteAuthor {
  return { displayName: "Alice Smith", id: null, uniqueName: null, ...overrides };
}

describe("noteWindowStart", () => {
  it("starts the window a whole number of weeks before now", () => {
    expect(noteWindowStart(new Date("2026-07-24T12:00:00Z"), 2)).toBe("2026-07-10T12:00:00.000Z");
  });

  it("moves the window with the clock rather than snapping to a day boundary", () => {
    expect(noteWindowStart(new Date("2026-07-24T09:30:45Z"), 1)).toBe("2026-07-17T09:30:45.000Z");
  });

  it("widens the window as the configured week count grows", () => {
    expect(noteWindowStart(new Date("2026-07-24T12:00:00Z"), 52)).toBe("2025-07-25T12:00:00.000Z");
  });
});

describe("sortNotesNewestFirst", () => {
  it("returns the notes newest first", () => {
    const notes = [
      createNote({ id: 1, createdDate: localIso(20, 9) }),
      createNote({ id: 2, createdDate: localIso(24, 9) }),
      createNote({ id: 3, createdDate: localIso(22, 9) }),
    ];

    expect(sortNotesNewestFirst(notes).map((note) => note.id)).toEqual([2, 3, 1]);
  });

  it("leaves the caller's array untouched", () => {
    const notes = [
      createNote({ id: 1, createdDate: localIso(20, 9) }),
      createNote({ id: 2, createdDate: localIso(24, 9) }),
    ];

    const sorted = sortNotesNewestFirst(notes);

    expect(sorted).not.toBe(notes);
    expect(notes.map((note) => note.id)).toEqual([1, 2]);
  });

  it("sorts a note whose date will not parse last, behind every dated one", () => {
    const notes = [
      createNote({ id: 1, createdDate: "not a date" }),
      createNote({ id: 2, createdDate: localIso(20, 9) }),
      createNote({ id: 3, createdDate: localIso(24, 9) }),
    ];

    expect(sortNotesNewestFirst(notes).map((note) => note.id)).toEqual([3, 2, 1]);
  });
});

describe("selectRecentNoteDays", () => {
  it("keeps only the two most recent days that have notes", () => {
    const notes = [
      createNote({ id: 1, createdDate: localIso(24, 9) }),
      createNote({ id: 2, createdDate: localIso(22, 9) }),
      createNote({ id: 3, createdDate: localIso(20, 9) }),
    ];

    expect(selectRecentNoteDays(notes).map((note) => note.id)).toEqual([1, 2]);
  });

  it("keeps EVERY note from those two days, however many there are", () => {
    const notes = [
      createNote({ id: 1, createdDate: localIso(24, 9) }),
      createNote({ id: 2, createdDate: localIso(24, 14) }),
      createNote({ id: 3, createdDate: localIso(24, 17) }),
      createNote({ id: 4, createdDate: localIso(22, 9) }),
      createNote({ id: 5, createdDate: localIso(21, 9) }),
    ];

    expect(selectRecentNoteDays(notes).map((note) => note.id)).toEqual([3, 2, 1, 4]);
  });

  it("counts days that HAVE notes, not calendar days, so a quiet stretch is skipped over", () => {
    const notes = [
      createNote({ id: 1, createdDate: localIso(24, 9) }),
      createNote({ id: 2, createdDate: localIso(2, 9) }),
    ];

    expect(selectRecentNoteDays(notes).map((note) => note.id)).toEqual([1, 2]);
  });

  it("drops a note whose date will not parse rather than counting it as a day", () => {
    const notes = [
      createNote({ id: 1, createdDate: "whenever" }),
      createNote({ id: 2, createdDate: localIso(24, 9) }),
      createNote({ id: 3, createdDate: localIso(22, 9) }),
    ];

    expect(selectRecentNoteDays(notes).map((note) => note.id)).toEqual([2, 3]);
  });

  it("returns nothing when there are no notes at all", () => {
    expect(selectRecentNoteDays([])).toEqual([]);
  });
});

describe("isOwnNote — identity GUID", () => {
  it("matches on the identity GUID, ignoring case", () => {
    const note = createNote({ id: 1, author: createAuthor({ id: "ABC-123" }) });

    expect(isOwnNote(note, createAuthor({ id: "abc-123" }))).toBe(true);
  });

  it("lets the GUID decide even when the sign-in addresses agree", () => {
    // Two identities in one directory can share an address alias; the GUID is what ADO authorizes an
    // edit against, so a GUID mismatch must win over an address match.
    const note = createNote({
      id: 1,
      author: createAuthor({ id: "guid-one", uniqueName: "alice@example.com" }),
    });

    expect(isOwnNote(note, createAuthor({ id: "guid-two", uniqueName: "alice@example.com" }))).toBe(
      false,
    );
  });
});

describe("isOwnNote — address fallback and refusals", () => {
  it("falls back to the sign-in address when the note's author carries no GUID", () => {
    const note = createNote({ id: 1, author: createAuthor({ uniqueName: "Alice@Example.com" }) });

    expect(isOwnNote(note, createAuthor({ id: "guid-one", uniqueName: "alice@example.com" }))).toBe(
      true,
    );
  });

  it("falls back to the sign-in address when the READER carries no GUID", () => {
    const note = createNote({
      id: 1,
      author: createAuthor({ id: "guid-one", uniqueName: "alice@example.com" }),
    });

    expect(isOwnNote(note, createAuthor({ uniqueName: "alice@example.com" }))).toBe(true);
  });

  it("never claims a note when the reader is unknown", () => {
    const note = createNote({ id: 1, author: createAuthor({ id: "guid-one" }) });

    expect(isOwnNote(note, null)).toBe(false);
  });

  it("never matches two identities that carry only a display name", () => {
    // Two people routinely share a name, so a name match would offer an edit ADO rejects.
    const note = createNote({ id: 1, author: createAuthor({ displayName: "Alice Smith" }) });

    expect(isOwnNote(note, createAuthor({ displayName: "Alice Smith" }))).toBe(false);
  });
});
