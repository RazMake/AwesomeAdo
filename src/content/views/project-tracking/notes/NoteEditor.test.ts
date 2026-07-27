import { describe, expect, it, vi } from "vitest";

import { renderNoteEditor } from "./NoteEditor";

/** A promise a test resolves by hand, so an in-flight save is observable without timers. */
function deferred(): { promise: Promise<boolean>; resolve: (value: boolean) => void } {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** The editor's textarea, its two buttons and its failure line. */
function partsOf(root: HTMLElement) {
  const buttons = root.querySelectorAll<HTMLButtonElement>("button");
  return {
    input: root.querySelector<HTMLTextAreaElement>(".awesomeado-note-editor__input")!,
    submit: buttons[0]!,
    cancel: buttons[1]!,
    failure: root.querySelector<HTMLElement>(".awesomeado-note-editor__error")!,
  };
}

/** An editor over recording callbacks, opened on `initialText`. */
function openEditor(initialText = "", onSubmit = vi.fn(() => Promise.resolve(true))) {
  const onCancel = vi.fn();
  const root = renderNoteEditor(document, {
    initialText,
    submitLabel: "Save",
    onSubmit,
    onCancel,
  });
  return { root, onSubmit, onCancel, ...partsOf(root) };
}

describe("renderNoteEditor — opening", () => {
  it("opens on the text it was handed, so a correction starts from what was written", () => {
    const { input } = openEditor("The original note.");

    expect(input.value).toBe("The original note.");
  });

  it("labels the confirming button as the caller asked", () => {
    const { submit, cancel } = openEditor();

    expect(submit.textContent).toBe("Save");
    expect(cancel.textContent).toBe("Cancel");
  });
});

describe("renderNoteEditor — submitting", () => {
  it("saves the trimmed text, so stray whitespace never becomes part of the note", () => {
    const { input, submit, onSubmit } = openEditor();
    input.value = "  A note.  \n";

    submit.click();

    expect(onSubmit).toHaveBeenCalledWith("A note.");
  });

  it("refuses to save a note with nothing in it", () => {
    const { input, submit, onSubmit } = openEditor();
    input.value = "   \n\t ";

    submit.click();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves on Ctrl+Enter without reaching for the mouse", () => {
    const { input, onSubmit } = openEditor();
    input.value = "A note.";

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));

    expect(onSubmit).toHaveBeenCalledWith("A note.");
  });

  it("saves on Cmd+Enter too, for a Mac keyboard", () => {
    const { input, onSubmit } = openEditor();
    input.value = "A note.";

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));

    expect(onSubmit).toHaveBeenCalledWith("A note.");
  });

  it("leaves a plain Enter to the textarea, so a note can have more than one line", () => {
    const { input, onSubmit } = openEditor();
    input.value = "A note.";

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("renderNoteEditor — abandoning", () => {
  it("abandons the edit when Cancel is clicked", () => {
    const { cancel, onCancel } = openEditor("A note.");

    cancel.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("abandons the edit on Escape", () => {
    const { input, onCancel } = openEditor("A note.");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps typing inside the board, away from ADO's own page shortcuts underneath it", () => {
    const { root, input } = openEditor();
    const reachedThePage = vi.fn();
    document.body.append(root);
    document.body.addEventListener("keydown", reachedThePage);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(reachedThePage).not.toHaveBeenCalled();
    document.body.removeEventListener("keydown", reachedThePage);
    root.remove();
  });
});

describe("renderNoteEditor — while a save is in flight", () => {
  it("disables both buttons so one note cannot be posted twice", () => {
    const pending = deferred();
    const { input, submit, cancel } = openEditor(
      "",
      vi.fn(() => pending.promise),
    );
    input.value = "A note.";

    submit.click();

    expect(submit.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
  });

  it("ignores a second submit while the first is still saving", () => {
    const pending = deferred();
    const onSubmit = vi.fn(() => pending.promise);
    const { input, submit } = openEditor("", onSubmit);
    input.value = "A note.";

    submit.click();
    submit.dispatchEvent(new MouseEvent("click"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("re-enables the editor and says so when the save was refused", async () => {
    const { input, submit, cancel, failure } = openEditor(
      "",
      vi.fn(() => Promise.resolve(false)),
    );
    input.value = "A note.";

    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(submit.disabled).toBe(false);
    expect(cancel.disabled).toBe(false);
    expect(failure.style.display).toBe("inline");
    expect(failure.textContent).toContain("Not saved");
    // The author's words are still there: a rejected write must never cost them what they wrote.
    expect(input.value).toBe("A note.");
  });

  it("leaves the editor closed-looking on success, with no failure line", async () => {
    const { input, submit, failure } = openEditor(
      "",
      vi.fn(() => Promise.resolve(true)),
    );
    input.value = "A note.";

    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(failure.style.display).toBe("none");
    expect(submit.disabled).toBe(true);
  });
});
