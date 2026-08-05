import { describe, expect, it, vi } from "vitest";

import type { WorkItemNote } from "../../../../common/ado/WorkItemNote";
import { normalizeMarkerTags } from "../../../../common/settings/ExtensionSettings";
import { renderMarkerPill } from "../../../../common/view-common/control/MarkerPill/MarkerPill";

import { renderMarkerReasonsPill } from "./MarkerReasonsPill";

const SINCE = "2026-07-01T00:00:00.000Z";

function createNote(id: number, text: string): WorkItemNote {
  return {
    id,
    workItemId: 7,
    text,
    renderedHtml: null,
    createdDate: "2026-07-24T09:00:00.000Z",
    author: { id: "author", displayName: "Ada Lovelace", uniqueName: "ada@example.com" },
  };
}

/** A pill over a discussion holding one note per marker plus an ordinary one. */
function mountPill(
  overrides: {
    commentTag?: string;
    marker?: "blocked" | "interrupt";
    accepted?: boolean;
    notes?: WorkItemNote[];
  } = {},
) {
  const notes = overrides.notes ?? [
    createNote(1, "[BLOCKED] Waiting on the API team."),
    createNote(2, "[ACCEPTED] Platform owns this now."),
    createNote(3, "An ordinary project note."),
  ];
  const loadNotes = vi.fn(() =>
    Promise.resolve({
      notes,
      currentUser: null,
      error: null,
    }),
  );
  const markerTags = normalizeMarkerTags(undefined);
  const marker = overrides.marker ?? "blocked";
  const tags =
    overrides.commentTag === undefined
      ? markerTags[marker]
      : { ...markerTags[marker], commentTag: overrides.commentTag };

  const element = renderMarkerReasonsPill({
    doc: document,
    item: { id: 7, tags: [tags.tag], noteCount: notes.length } as never,
    marker,
    tags,
    accepted: overrides.accepted,
    notesSinceIso: SINCE,
    services: {
      noteLoader: { loadNotes },
      noteWriter: { addNote: vi.fn(), editNote: vi.fn() } as never,
      mentionDirectory: {
        resolveNames: vi.fn(() => Promise.resolve(new Map<string, string>())),
        knownNames: () => new Map<string, string>(),
      },
      userDirectory: {
        search: vi.fn(() => Promise.resolve([])),
        resolve: vi.fn(() => Promise.resolve(null)),
      },
      markerTags: () => markerTags,
      logger: { info: vi.fn(), error: vi.fn() },
    },
  });
  document.body.append(element);
  return { element, loadNotes };
}

/** Open the pill's popup and let the note read settle. */
async function openPopup(element: HTMLElement): Promise<void> {
  for (let tick = 0; tick < 6; tick += 1) {
    await Promise.resolve();
  }
  element.querySelector<HTMLButtonElement>(".awesomeado-marker-pill")!.click();
  for (let tick = 0; tick < 4; tick += 1) {
    await Promise.resolve();
  }
}

describe("renderMarkerReasonsPill", () => {
  it("shows only the notes carrying this marker's comment token", async () => {
    const { element } = mountPill();

    await openPopup(element);

    const notes = [...element.querySelectorAll(".awesomeado-note")].map(
      (note) => note.textContent ?? "",
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Waiting on the API team.");
    expect(notes[0]).not.toContain("[BLOCKED]");
    expect(element.querySelector(".awesomeado-marker-pill")?.getAttribute("title")).toBeNull();
    expect(
      element.querySelector<HTMLElement>(".awesomeado-marker-reasons__popup")?.style.borderRadius,
    ).toBe("8px");
    element.remove();
  });

  it("offers no composer, because a note typed there would not carry the token", async () => {
    const { element } = mountPill();

    await openPopup(element);

    // It would vanish from the very list it was written in, which reads as a lost note.
    expect(element.querySelector(".awesomeado-notes__composer")).toBeNull();
    element.remove();
  });

  it("reads marker notes before deciding whether the pill can be clicked", async () => {
    const { element, loadNotes } = mountPill();

    expect(element.querySelector(".awesomeado-marker-pill")?.getAttribute("title")).toBe(
      "Loading notes",
    );
    await Promise.resolve();
    expect(loadNotes).toHaveBeenCalledTimes(1);
    element.remove();
  });

  it("stays a tooltip-only label when no matching notes exist", async () => {
    const { element } = mountPill({ notes: [createNote(3, "An ordinary project note.")] });
    for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();

    expect(element.querySelector("button")).toBeNull();
    expect(element.querySelector(".awesomeado-marker-pill")?.tagName).toBe("SPAN");
    // The tooltip names the token nothing matched, so an inert pill is not a mystery.
    expect(element.querySelector(".awesomeado-marker-pill")?.getAttribute("title")).toBe(
      'No note in this window starts with "[BLOCKED]"',
    );
    element.remove();
  });

  it("says an unconfigured comment tag is why the pill cannot open", async () => {
    const { element } = mountPill({ commentTag: "" });
    for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();

    expect(element.querySelector(".awesomeado-marker-pill")?.getAttribute("title")).toContain(
      "No comment tag is configured for Blocked (internal)",
    );
    element.remove();
  });

  it("hides the configured acceptance token and shows only the reasoning", async () => {
    const { element } = mountPill({
      marker: "interrupt",
      notes: [createNote(2, "[ACCEPTED] Platform owns this now.")],
    });

    await openPopup(element);

    const text = element.querySelector(".awesomeado-note__text")?.textContent ?? "";
    expect(text).toContain("Platform owns this now.");
    expect(text).not.toContain("[ACCEPTED]");
    element.remove();
  });
});

/**
 * A board card must show the SAME pill a right-click menu previews. The card is the surface where a
 * raised Interrupt once lost its outline, so it is pinned to the shared control's own output here
 * rather than to a copy of the values, which would drift with it.
 */
describe("the pill a card wears", () => {
  const shownPill = (element: HTMLElement): HTMLElement => {
    const pill = element.querySelector<HTMLElement>(".awesomeado-marker-pill")!;
    // The pointer is the one thing opening its notes is allowed to add.
    pill.style.removeProperty("cursor");
    return pill;
  };

  it.each([false, true])("is the shared Interrupt pill when accepted is %s", async (accepted) => {
    const { element } = mountPill({ marker: "interrupt", accepted });
    for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();

    const pill = shownPill(element);
    expect(pill.tagName).toBe("BUTTON");
    expect(pill.getAttribute("style")).toBe(
      renderMarkerPill(document, { marker: "interrupt", accepted }).getAttribute("style"),
    );
    element.remove();
  });

  it("is still that pill when it has no notes to open", async () => {
    const { element } = mountPill({ marker: "interrupt", commentTag: "" });
    for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();

    const pill = shownPill(element);
    expect(pill.tagName).toBe("SPAN");
    expect(pill.getAttribute("style")).toBe(
      renderMarkerPill(document, { marker: "interrupt" }).getAttribute("style"),
    );
    element.remove();
  });
});
