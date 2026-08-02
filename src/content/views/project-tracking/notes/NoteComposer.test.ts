import { describe, expect, it, vi } from "vitest";

import { renderNoteComposer } from "./NoteComposer";

/** A composer over a recording submit hook. */
function openComposer() {
  const onSubmit = vi.fn(() => Promise.resolve(true));
  const root = renderNoteComposer(document, {
    mentions: {
      userDirectory: {
        search: vi.fn(() => Promise.resolve([])),
        resolve: vi.fn(() => Promise.resolve(null)),
      },
      logger: { info: vi.fn(), error: vi.fn() },
    },
    onSubmit,
  });
  return { root, onSubmit };
}

/** The composer's collapsed trigger, or null once it has been swapped out for the editor. */
function triggerOf(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(".awesomeado-note-composer__trigger");
}

/** The composer's open editor input, or null while it is collapsed. */
function inputOf(root: HTMLElement): HTMLTextAreaElement | null {
  return root.querySelector<HTMLTextAreaElement>(".awesomeado-text-editor__input");
}

describe("renderNoteComposer", () => {
  it("starts as a link rather than a permanently-open box on every row", () => {
    const { root } = openComposer();

    // A non-breaking space keeps "+" welded to "Add note" if the row wraps.
    expect(triggerOf(root)?.textContent).toBe("+\u00A0Add note");
    expect(inputOf(root)).toBeNull();
  });

  it("swaps the link for an empty editor when it is clicked", () => {
    const { root } = openComposer();

    triggerOf(root)?.click();

    expect(inputOf(root)?.value).toBe("");
    expect(triggerOf(root)).toBeNull();
  });

  it("puts the link back when the edit is abandoned", () => {
    const { root } = openComposer();
    triggerOf(root)?.click();

    const cancel = [...root.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    cancel?.click();

    expect(triggerOf(root)).not.toBeNull();
    expect(inputOf(root)).toBeNull();
  });

  it("posts what was typed through the caller's hook", () => {
    const { root, onSubmit } = openComposer();
    triggerOf(root)?.click();
    const input = inputOf(root)!;
    input.value = "  A note.  ";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const add = [...root.querySelectorAll("button")].find((button) => button.textContent === "Add");
    add?.click();

    expect(onSubmit).toHaveBeenCalledWith("A note.");
  });
});
