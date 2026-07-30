import { describe, expect, it, vi } from "vitest";

import type { NoteAuthor, WorkItemNote } from "../../../../common/ado/WorkItemNote";
import { normalizeMarkerTags } from "../../../../common/settings/ExtensionSettings";

import {
  createNotesPanelState,
  renderNotesPanel,
  type NotesPanelHandle,
  type NotesPanelState,
} from "./NotesPanel";

const WORK_ITEM_ID = 42;
const SINCE = "2026-07-10T00:00:00Z";

const READER: NoteAuthor = {
  displayName: "Alice Smith",
  id: "guid-alice",
  uniqueName: "alice@example.com",
};

/**
 * An ISO timestamp for a LOCAL wall-clock moment.
 *
 * The panel shows the last two days in the READER's zone, so a fixture written as a fixed UTC
 * instant would land on a different local day depending on where the suite runs.
 */
function localIso(day: number, hour: number): string {
  return new Date(2026, 6, day, hour, 0, 0).toISOString();
}

/** A note carrying the fixture defaults every case shares. */
function createNote(overrides: Partial<WorkItemNote> & { id: number }): WorkItemNote {
  return {
    workItemId: WORK_ITEM_ID,
    author: READER,
    createdDate: localIso(24, 9),
    text: `Note ${overrides.id}`,
    renderedHtml: null,
    ...overrides,
  };
}

/** Settle the panel's fetch-then-render chain without leaning on a timer. */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) {
    await Promise.resolve();
  }
}

/** A mounted panel over fake services, plus every recorder a case might assert on. */
function mountPanel(
  overrides: {
    notes?: WorkItemNote[];
    currentUser?: NoteAuthor | null;
    loadError?: string | null;
    addResult?: { ok: boolean; note?: WorkItemNote };
    editResult?: { ok: boolean; note?: WorkItemNote };
    mentionNames?: Map<string, string>;
    showAllInWindow?: boolean;
    state?: NotesPanelState;
  } = {},
) {
  const loadNotes = vi.fn(() =>
    Promise.resolve({
      notes: overrides.notes ?? [],
      currentUser: overrides.currentUser ?? null,
      error: overrides.loadError ?? null,
    }),
  );
  const addNote = vi.fn(() => Promise.resolve(overrides.addResult ?? { ok: true }));
  const editNote = vi.fn(() => Promise.resolve(overrides.editResult ?? { ok: true }));
  const info = vi.fn();
  const error = vi.fn();
  const knownMentions = overrides.mentionNames ?? new Map<string, string>();
  const resolveNames = vi.fn(() => Promise.resolve(knownMentions));
  const handle = renderNotesPanel({
    doc: document,
    workItemId: WORK_ITEM_ID,
    sinceIso: SINCE,
    services: {
      noteLoader: { loadNotes },
      noteWriter: { addNote, editNote },
      mentionDirectory: { resolveNames, knownNames: () => knownMentions },
      userDirectory: {
        search: vi.fn(() => Promise.resolve([])),
        resolve: vi.fn(() => Promise.resolve(null)),
      },
      markerTags: () => normalizeMarkerTags(undefined),
      logger: { info, error },
    },
    state: overrides.state,
    showAllInWindow: overrides.showAllInWindow,
  });
  return { handle, loadNotes, addNote, editNote, resolveNames, info, error };
}

/** The note rows the panel is currently showing. */
function rowsOf(handle: NotesPanelHandle): HTMLElement[] {
  return [...handle.element.querySelectorAll<HTMLElement>(".awesomeado-note")];
}

/** The single explanatory line standing in for the list, or "" when real rows are showing. */
function statusOf(handle: NotesPanelHandle): string {
  return handle.element.querySelector(".awesomeado-notes__status")?.textContent ?? "";
}

/** The button carrying `label` within `root`. */
function buttonLabelled(root: HTMLElement, label: string): HTMLButtonElement {
  return [...root.querySelectorAll("button")].find((button) => button.textContent === label)!;
}

/** Open the panel and let its first fetch settle. */
async function expand(handle: NotesPanelHandle): Promise<void> {
  handle.setExpanded(true);
  await flush();
}

describe("renderNotesPanel — fetching on first open", () => {
  it("starts closed and reads nothing, because nobody has asked for this discussion yet", () => {
    const { handle, loadNotes } = mountPanel();

    expect(handle.element.style.display).toBe("none");
    expect(handle.isExpanded()).toBe(false);
    expect(loadNotes).not.toHaveBeenCalled();
  });

  it("reads the item's discussion over the binding's window on the first open", async () => {
    const { handle, loadNotes } = mountPanel({ notes: [createNote({ id: 1 })] });

    await expand(handle);

    expect(loadNotes).toHaveBeenCalledWith({ workItemId: WORK_ITEM_ID, sinceIso: SINCE });
    expect(handle.element.style.display).toBe("block");
    expect(rowsOf(handle)).toHaveLength(1);
  });

  it("re-opens from what it already read, without asking Azure DevOps again", async () => {
    const { handle, loadNotes } = mountPanel({ notes: [createNote({ id: 1 })] });
    await expand(handle);

    handle.setExpanded(false);
    await expand(handle);

    expect(loadNotes).toHaveBeenCalledTimes(1);
    expect(rowsOf(handle)).toHaveLength(1);
  });

  it("reuses a session-owned cache when a board repaint creates a replacement panel", async () => {
    const state = createNotesPanelState();
    const first = mountPanel({ state, notes: [createNote({ id: 1 })] });
    await expand(first.handle);

    const replacement = mountPanel({ state });
    await expand(replacement.handle);

    expect(first.loadNotes).toHaveBeenCalledTimes(1);
    expect(replacement.loadNotes).not.toHaveBeenCalled();
    expect(rowsOf(replacement.handle)).toHaveLength(1);
  });

  it("ignores being told again what it already is, so a repaint neither refetches nor floods the log", () => {
    const { handle, loadNotes, info } = mountPanel();

    handle.setExpanded(false);

    expect(loadNotes).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("records the flip with the signals behind it", async () => {
    const { handle, info } = mountPanel({ notes: [createNote({ id: 1 })] });

    await expand(handle);

    expect(String(info.mock.calls[0]?.[0])).toContain("fetching=true");
  });
});

describe("renderNotesPanel — what an open panel shows", () => {
  it("says so when the item has no notes in the window", async () => {
    const { handle } = mountPanel();

    await expand(handle);

    expect(statusOf(handle)).toBe("No notes in this window.");
  });

  it("shows only the two most recent days that have notes", async () => {
    const { handle } = mountPanel({
      notes: [
        createNote({ id: 1, createdDate: localIso(24, 9), text: "Today" }),
        createNote({ id: 2, createdDate: localIso(24, 16), text: "Also today" }),
        createNote({ id: 3, createdDate: localIso(22, 9), text: "Two days back" }),
        createNote({ id: 4, createdDate: localIso(20, 9), text: "Too far back" }),
      ],
    });

    await expand(handle);

    expect(rowsOf(handle).map((row) => row.textContent)).toHaveLength(3);
    expect(handle.element.textContent).not.toContain("Too far back");
  });

  it("shows the newest note first", async () => {
    const { handle } = mountPanel({
      notes: [
        createNote({ id: 1, createdDate: localIso(24, 9), text: "Earlier" }),
        createNote({ id: 2, createdDate: localIso(24, 16), text: "Later" }),
      ],
    });

    await expand(handle);

    expect(rowsOf(handle)[0]?.textContent).toContain("Later");
  });

  it("omits notes beginning with any configured marker comment tag", async () => {
    const { handle } = mountPanel({
      notes: [
        createNote({ id: 1, text: "[BLOCKED] Waiting for review." }),
        createNote({ id: 2, text: "[ACCEPTED] Another team owns this." }),
        createNote({ id: 3, text: "A normal project note." }),
      ],
    });

    await expand(handle);

    expect(rowsOf(handle)).toHaveLength(1);
    expect(handle.element.textContent).toContain("A normal project note.");
    expect(handle.element.textContent).not.toContain("Waiting for review");
  });

  it("shows marker-prefixed notes in the deliberately complete popup", async () => {
    const { handle } = mountPanel({
      notes: [
        createNote({ id: 1, text: "[BLOCKED] Waiting for review." }),
        createNote({ id: 2, text: "A normal project note." }),
      ],
      showAllInWindow: true,
    });

    await expand(handle);

    expect(rowsOf(handle)).toHaveLength(2);
    expect(handle.element.textContent).toContain("[BLOCKED] Waiting for review.");
  });

  it("sets the marker prefix apart as code, so it reads as a token rather than as words", async () => {
    const { handle } = mountPanel({
      notes: [createNote({ id: 1, text: "[BLOCKED] Waiting for review." })],
      showAllInWindow: true,
    });

    await expand(handle);

    expect(handle.element.querySelector("code")?.textContent).toBe("[BLOCKED]");
  });
});

describe("renderNotesPanel — a failed read", () => {
  it("says the read failed rather than claiming there is nothing to read", async () => {
    const { handle } = mountPanel({ loadError: "HTTP 401" });

    await expand(handle);

    expect(statusOf(handle)).toBe("Could not load notes.");
  });

  it("tries again on the next open, instead of staying broken for the session", async () => {
    const { handle, loadNotes } = mountPanel({ loadError: "HTTP 401" });
    await expand(handle);

    handle.setExpanded(false);
    await expand(handle);

    expect(loadNotes).toHaveBeenCalledTimes(2);
  });
});

describe("renderNotesPanel — @-mentions", () => {
  const ADA = "11111111-2222-3333-4444-555555555555";
  const GRACE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("resolves every mention in the notes it fetched, in one call", async () => {
    // One call for the panel, not one per note: the same people are mentioned over and over in a
    // discussion, and a request per mention would make opening a panel a burst of round-trips.
    const { handle, resolveNames } = mountPanel({
      notes: [
        createNote({ id: 1, text: `Handing to @<${ADA}>.` }),
        createNote({ id: 2, text: `cc @<${GRACE}> and @<${ADA}>` }),
      ],
    });

    await expand(handle);

    expect(resolveNames).toHaveBeenCalledTimes(1);
    expect(resolveNames).toHaveBeenCalledWith([ADA, GRACE]);
  });

  it("also collects the mentions inside ADO's own rendering of a note", async () => {
    const { handle, resolveNames } = mountPanel({
      notes: [
        createNote({
          id: 1,
          text: "see thread",
          renderedHtml: `<p><a data-vss-mention="version:2.0,${GRACE}">@Grace</a></p>`,
        }),
      ],
    });

    await expand(handle);

    expect(resolveNames).toHaveBeenCalledWith([GRACE]);
  });

  it("renders the resolved name, because the rows are built after the lookup settles", async () => {
    const { handle } = mountPanel({
      notes: [createNote({ id: 1, text: `Handing to @<${ADA}>.` })],
      mentionNames: new Map([[ADA, "Ada Lovelace"]]),
    });

    await expand(handle);

    expect(rowsOf(handle)[0]?.querySelector(".awesomeado-markdown__mention")?.textContent).toBe(
      "@Ada Lovelace",
    );
  });

  it("asks nothing when the discussion mentions nobody", async () => {
    const { handle, resolveNames } = mountPanel({ notes: [createNote({ id: 1 })] });

    await expand(handle);

    expect(resolveNames).not.toHaveBeenCalled();
  });

  it("resolves the mentions in a note it has just written", async () => {
    // ADO hands a stored note back WITHOUT its rendering, so the new row renders from the raw source
    // and its bare GUIDs — the one place a mention the author just typed would stay anonymous.
    const { handle, resolveNames } = mountPanel({
      addResult: { ok: true, note: createNote({ id: 9, text: `Over to @<${ADA}>.` }) },
    });
    await expand(handle);

    buttonLabelled(handle.element, "+\u00A0Add note").click();
    handle.element.querySelector<HTMLTextAreaElement>(".awesomeado-text-editor__input")!.value =
      "Over to someone";
    buttonLabelled(handle.element, "Add").click();
    await flush();

    expect(resolveNames).toHaveBeenCalledWith([ADA]);
  });
});

describe("renderNotesPanel — adding a note", () => {
  const posted = createNote({ id: 9, createdDate: localIso(24, 18), text: "Just added." });

  /** Open the composer, type `text` and confirm it. */
  async function addThroughComposer(handle: NotesPanelHandle, text: string): Promise<void> {
    buttonLabelled(handle.element, "+\u00A0Add note").click();
    handle.element.querySelector<HTMLTextAreaElement>(".awesomeado-text-editor__input")!.value =
      text;
    buttonLabelled(handle.element, "Add").click();
    await flush();
  }

  it("posts the typed note and shows what Azure DevOps stored", async () => {
    const { handle, addNote } = mountPanel({ addResult: { ok: true, note: posted } });
    await expand(handle);

    await addThroughComposer(handle, "Just added.");

    expect(addNote).toHaveBeenCalledWith({ workItemId: WORK_ITEM_ID, text: "Just added." });
    expect(rowsOf(handle)[0]?.textContent).toContain("Just added.");
  });

  it("leaves the list exactly as it was when the write was refused", async () => {
    const { handle } = mountPanel({
      notes: [createNote({ id: 1, text: "Existing." })],
      addResult: { ok: false },
    });
    await expand(handle);

    await addThroughComposer(handle, "Never stored.");

    expect(rowsOf(handle)).toHaveLength(1);
    expect(handle.element.textContent).not.toContain("Never stored.");
  });
});

describe("renderNotesPanel — correcting a note", () => {
  it("rewrites the reader's own note through the writer", async () => {
    const note = createNote({ id: 5, text: "Original." });
    const { handle, editNote } = mountPanel({
      notes: [note],
      currentUser: READER,
      editResult: { ok: true, note: { ...note, text: "Corrected." } },
    });
    await expand(handle);

    const row = rowsOf(handle)[0]!;
    buttonLabelled(row, READER.displayName).click();
    row.querySelector<HTMLTextAreaElement>(".awesomeado-text-editor__input")!.value = "Corrected.";
    buttonLabelled(row, "Save").click();
    await flush();

    expect(editNote).toHaveBeenCalledWith({
      workItemId: WORK_ITEM_ID,
      noteId: 5,
      text: "Corrected.",
    });
    expect(rowsOf(handle)[0]?.textContent).toContain("Corrected.");
  });

  it("offers no correction on a note the reader did not write", async () => {
    const { handle } = mountPanel({
      notes: [createNote({ id: 5, author: { ...READER, id: "guid-bob" } })],
      currentUser: READER,
    });

    await expand(handle);

    expect(rowsOf(handle)[0]?.querySelector(".awesomeado-note__author")?.tagName).toBe("SPAN");
  });
});
