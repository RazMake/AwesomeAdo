import { describe, expect, it, vi } from "vitest";

import type { WorkItemNote } from "../../../../common/ado/WorkItemNote";
import { normalizeMarkerTags } from "../../../../common/settings/ExtensionSettings";

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
function mountPill(overrides: { commentTag?: string } = {}) {
  const loadNotes = vi.fn(() =>
    Promise.resolve({
      notes: [
        createNote(1, "[BLOCKED] Waiting on the API team."),
        createNote(2, "[ACCEPTED] Platform owns this now."),
        createNote(3, "An ordinary project note."),
      ],
      currentUser: null,
      error: null,
    }),
  );
  const markerTags = normalizeMarkerTags(undefined);
  const tags =
    overrides.commentTag === undefined
      ? markerTags.blocked
      : { ...markerTags.blocked, commentTag: overrides.commentTag };

  const element = renderMarkerReasonsPill({
    doc: document,
    item: { id: 7, tags: [tags.tag] } as never,
    marker: "blocked",
    tags,
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
    element.remove();
  });

  it("offers no composer, because a note typed there would not carry the token", async () => {
    const { element } = mountPill();

    await openPopup(element);

    // It would vanish from the very list it was written in, which reads as a lost note.
    expect(element.querySelector(".awesomeado-notes__composer")).toBeNull();
    element.remove();
  });

  it("reads the discussion only when the pill is actually clicked", () => {
    const { element, loadNotes } = mountPill();

    // A board shows dozens of rows; reading every marker's reasons up front would be dozens of
    // credentialed requests for popups nobody opened.
    expect(loadNotes).not.toHaveBeenCalled();
    element.remove();
  });

  it("stays a plain label when the team configured no comment token for the marker", () => {
    const { element } = mountPill({ commentTag: "" });

    // Nothing identifies which notes explain it, so an empty popup would claim nobody said why.
    expect(element.querySelector("button")).toBeNull();
    expect(element.querySelector(".awesomeado-marker-pill")?.tagName).toBe("SPAN");
    element.remove();
  });
});
