import { describe, expect, it, vi } from "vitest";

import { renderTextEditor } from "./TextEditor";

/** A promise a test resolves by hand, so an in-flight save is observable without timers. */
function deferred(): { promise: Promise<boolean>; resolve: (value: boolean) => void } {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** The editor's field, its two buttons and its failure line. */
function partsOf(root: HTMLElement) {
  const buttons = root.querySelectorAll<HTMLButtonElement>("button");
  return {
    input: root.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      ".awesomeado-text-editor__input",
    )!,
    submit: buttons[0]!,
    cancel: buttons[1]!,
    failure: root.querySelector<HTMLElement>(".awesomeado-text-editor__error")!,
  };
}

/** An editor over recording callbacks, opened on `initialText`. */
function openEditor(
  initialText = "",
  onSubmit = vi.fn(() => Promise.resolve(true)),
  overrides: { singleLine?: boolean; allowEmpty?: boolean; maxLength?: number } = {},
) {
  const onCancel = vi.fn();
  const root = renderTextEditor(document, {
    initialText,
    submitLabel: "Save",
    onSubmit,
    onCancel,
    ...overrides,
  });
  return { root, onSubmit, onCancel, ...partsOf(root) };
}

describe("renderTextEditor — opening", () => {
  it("opens on the text it was handed, so a correction starts from what was written", () => {
    const { input } = openEditor("The original text.");

    expect(input.value).toBe("The original text.");
  });

  it("labels the confirming button as the caller asked", () => {
    const { submit, cancel } = openEditor();

    expect(submit.textContent).toBe("Save");
    expect(cancel.textContent).toBe("Cancel");
  });

  it("renders a Markdown textarea by default", () => {
    const { input } = openEditor();

    expect(input.tagName).toBe("TEXTAREA");
    expect(input.placeholder).toContain("Markdown");
  });

  it("renders a one-line field when asked, hinting at the shortcut that fits it", () => {
    const { input } = openEditor("A title", undefined, { singleLine: true });

    expect(input.tagName).toBe("INPUT");
    expect(input.placeholder).not.toContain("Markdown");
  });

  it("caps the field at the caller's limit", () => {
    const { input } = openEditor("", undefined, { maxLength: 12 });

    expect(input.maxLength).toBe(12);
  });
});

describe("renderTextEditor — submitting", () => {
  it("saves the trimmed text, so stray whitespace never becomes part of the value", () => {
    const { input, submit, onSubmit } = openEditor();
    input.value = "  Some text.  \n";

    submit.click();

    expect(onSubmit).toHaveBeenCalledWith("Some text.");
  });

  it("refuses to save nothing when the value must exist", () => {
    const { input, submit, onSubmit } = openEditor();
    input.value = "   \n\t ";

    submit.click();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves nothing when the value may be cleared", () => {
    const { input, submit, onSubmit } = openEditor("Old text.", undefined, { allowEmpty: true });
    input.value = "  ";

    submit.click();

    expect(onSubmit).toHaveBeenCalledWith("");
  });

  it("saves on Ctrl+Enter without reaching for the mouse", () => {
    const { input, onSubmit } = openEditor();
    input.value = "Some text.";

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));

    expect(onSubmit).toHaveBeenCalledWith("Some text.");
  });

  it("saves on Cmd+Enter too, for a Mac keyboard", () => {
    const { input, onSubmit } = openEditor();
    input.value = "Some text.";

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));

    expect(onSubmit).toHaveBeenCalledWith("Some text.");
  });

  it("leaves a plain Enter to the textarea, so a note can have more than one line", () => {
    const { input, onSubmit } = openEditor();
    input.value = "Some text.";

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("commits a one-line field on a bare Enter, where there is no newline to insert", () => {
    const { input, onSubmit } = openEditor("", undefined, { singleLine: true });
    input.value = "A title";

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(onSubmit).toHaveBeenCalledWith("A title");
  });
});

describe("renderTextEditor — abandoning", () => {
  it("abandons the edit when Cancel is clicked", () => {
    const { cancel, onCancel } = openEditor("Some text.");

    cancel.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("abandons the edit on Escape", () => {
    const { input, onCancel } = openEditor("Some text.");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps typing inside the view, away from ADO's own page shortcuts underneath it", () => {
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

describe("renderTextEditor — while a save is in flight", () => {
  it("disables both buttons so one value cannot be posted twice", () => {
    const pending = deferred();
    const { input, submit, cancel } = openEditor(
      "",
      vi.fn(() => pending.promise),
    );
    input.value = "Some text.";

    submit.click();

    expect(submit.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
  });

  it("ignores a second submit while the first is still saving", () => {
    const pending = deferred();
    const onSubmit = vi.fn(() => pending.promise);
    const { input, submit } = openEditor("", onSubmit);
    input.value = "Some text.";

    submit.click();
    submit.dispatchEvent(new MouseEvent("click"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("re-enables the editor and says so when the save was refused", async () => {
    const { input, submit, cancel, failure } = openEditor(
      "",
      vi.fn(() => Promise.resolve(false)),
    );
    input.value = "Some text.";

    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(submit.disabled).toBe(false);
    expect(cancel.disabled).toBe(false);
    expect(failure.style.display).toBe("inline");
    expect(failure.textContent).toContain("Not saved");
    // The author's words are still there: a rejected write must never cost them what they wrote.
    expect(input.value).toBe("Some text.");
  });

  it("leaves the editor closed-looking on success, with no failure line", async () => {
    const { input, submit, failure } = openEditor(
      "",
      vi.fn(() => Promise.resolve(true)),
    );
    input.value = "Some text.";

    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(failure.style.display).toBe("none");
    expect(submit.disabled).toBe(true);
  });
});
