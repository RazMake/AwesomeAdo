import { describe, expect, it, vi } from "vitest";

import type { TextEditorMentionOptions } from "./MentionSuggestions";
import { renderTextEditor, type TextEditorOptions } from "./TextEditor";

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
  overrides: Pick<TextEditorOptions, "singleLine" | "allowEmpty" | "maxLength" | "mentions"> = {},
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

function typeText(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
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
    typeText(input, "  Some text.  \n");

    submit.click();

    expect(onSubmit).toHaveBeenCalledWith("Some text.");
  });

  it("refuses to save nothing when the value must exist", () => {
    const { input, submit, onSubmit } = openEditor();
    typeText(input, "   \n\t ");

    expect(submit.disabled).toBe(true);
    submit.click();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves nothing when the value may be cleared", () => {
    const { input, submit, onSubmit } = openEditor("Old text.", undefined, { allowEmpty: true });
    typeText(input, "  ");

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

/** Dispatch a paste event carrying `text`; jsdom does not provide a writable system clipboard. */
function paste(input: HTMLInputElement | HTMLTextAreaElement, text: string): ClipboardEvent {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (format: string) => (format === "text/plain" ? text : "") },
  });
  input.dispatchEvent(event);
  return event;
}

describe("renderTextEditor — Markdown authoring", () => {
  it("wraps selected text in bold markers and keeps the words selected", () => {
    const { input } = openEditor("make this bold");
    input.setSelectionRange(10, 14);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));

    expect(input.value).toBe("make this **bold**");
    expect([input.selectionStart, input.selectionEnd]).toEqual([12, 16]);
  });

  it("inserts empty bold markers with the caret between them", () => {
    const { input } = openEditor("Start ");
    input.setSelectionRange(6, 6);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));

    expect(input.value).toBe("Start ****");
    expect([input.selectionStart, input.selectionEnd]).toEqual([8, 8]);
  });

  it("uses single underscore markers for italic text", () => {
    const { input } = openEditor("italic");
    input.select();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "I", ctrlKey: true }));

    expect(input.value).toBe("_italic_");
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 7]);
  });

  it("turns a pasted link into Markdown and leaves the caret in its empty label", () => {
    const { input } = openEditor("See ");
    input.setSelectionRange(4, 4);

    const event = paste(input, "https://example.com/work/7");

    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe("See [](https://example.com/work/7)");
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5]);
  });

  it("leaves non-link paste and one-line fields to their native behavior", () => {
    const multiline = openEditor("Before").input;
    const plainPaste = paste(multiline, "not a link");
    const singleLine = openEditor("Title", undefined, { singleLine: true }).input;
    singleLine.select();
    singleLine.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));

    expect(plainPaste.defaultPrevented).toBe(false);
    expect(multiline.value).toBe("Before");
    expect(singleLine.value).toBe("Title");
  });
});

const ADA = "11111111-2222-3333-4444-555555555555";
const GRACE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** A mention-enabled editor, mounted in the document so the dropdown can be measured. */
function mentionEditor(
  overrides: Partial<TextEditorMentionOptions> & { initialText?: string } = {},
) {
  const { initialText = "", ...mentions } = overrides;
  const search = vi.fn(() =>
    Promise.resolve([
      { id: ADA, displayName: "Ada Lovelace", uniqueName: "ada@example.com", imageUrl: null },
      { id: GRACE, displayName: "Grace Hopper", uniqueName: "grace@example.com", imageUrl: null },
    ]),
  );
  const error = vi.fn();
  const editor = openEditor(initialText, undefined, {
    mentions: {
      userDirectory: { search, resolve: vi.fn(() => Promise.resolve(null)) },
      logger: { info: vi.fn(), error },
      ...mentions,
    },
  });
  document.body.append(editor.root);
  return { ...editor, search, error };
}

describe("renderTextEditor — @-mentions", () => {
  it.each([" ", ".", "/", "\\", "\t"])(
    "opens after the supported %j separator without adding a second search box",
    (separator) => {
      const { root, input } = mentionEditor();
      input.value = `Before${separator}@`;
      input.setSelectionRange(input.value.length, input.value.length);

      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(root.querySelector(".awesomeado-text-editor__mentions")).not.toBeNull();
      expect(root.querySelector(".awesomeado-text-editor__mentions input")).toBeNull();
      root.remove();
    },
  );

  it("does not start a mention in the middle of a word", () => {
    const { root, input, search } = mentionEditor();
    input.value = "email@example.com";
    input.setSelectionRange(input.value.length, input.value.length);

    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(root.querySelector(".awesomeado-text-editor__mentions")).toBeNull();
    expect(search).not.toHaveBeenCalled();
    root.remove();
  });

  it("anchors the list at the @ being completed rather than under the whole box", () => {
    const { root, input } = mentionEditor();
    input.value = "Line one\nLine two @";
    input.setSelectionRange(input.value.length, input.value.length);

    input.dispatchEvent(new Event("input", { bubbles: true }));

    // A tall editor pinning the list to its bottom edge leaves it floating far from the caret; the
    // offsets are measured, so they must be real pixels and never the box-height `100%`.
    const popup = root.querySelector<HTMLElement>(".awesomeado-text-editor__mentions")!;
    expect(popup.style.top).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(popup.style.left).toMatch(/^-?\d+(\.\d+)?px$/);
    // The hidden copy used to measure the caret must never be left behind in the editor.
    expect(root.querySelectorAll(".awesomeado-text-editor__caret-mirror")).toHaveLength(0);
    root.remove();
  });
});

describe("renderTextEditor — inserting a mention", () => {
  it("searches from the text after @ and inserts the arrow-highlighted identity as a reference", async () => {
    const { root, input, submit, onSubmit, search } = mentionEditor();
    input.value = "Ask @ad";
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(search).toHaveBeenCalledWith("ad");
    // The author sees WHO they picked, not a GUID they cannot read.
    expect(input.value).toBe("Ask @Grace Hopper");
    expect([input.selectionStart, input.selectionEnd]).toEqual([
      input.value.length,
      input.value.length,
    ]);
    expect(root.querySelector(".awesomeado-text-editor__mentions")).toBeNull();

    submit.click();

    // What ADO stores must still be the identity reference, or the mention renders as plain text.
    expect(onSubmit).toHaveBeenCalledWith(`Ask @<${GRACE}>`);
    root.remove();
  });

  it("does not reopen the list for the words typed after a settled mention", async () => {
    const { root, input, search } = mentionEditor();
    input.value = "Ask @ad";
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    input.value = `${input.value} please take a look`;
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // A name has spaces in it, so the rest of the sentence keeps matching as though it were the
    // query — the list would reopen on every keystroke and search for the whole line.
    expect(root.querySelector(".awesomeado-text-editor__mentions")).toBeNull();
    expect(search).toHaveBeenCalledTimes(1);
    root.remove();
  });

  it("leaves a name nobody picked from the list alone", async () => {
    const { root, input, submit, onSubmit } = mentionEditor();
    typeText(input, "Ask @Grace Hopper and @Someone Else");
    submit.click();
    await Promise.resolve();

    // Only a name this editor actually inserted stands for an identity; anything else is just words.
    expect(onSubmit).toHaveBeenCalledWith("Ask @Grace Hopper and @Someone Else");
    root.remove();
  });
});

describe("renderTextEditor — mentions already in the text", () => {
  it("opens on the person's name, not on the identity id that was stored", () => {
    const { root, input } = mentionEditor({
      initialText: `Thanks @<${ADA}> for the review.`,
      mentionNames: new Map([[ADA, "Ada Lovelace"]]),
    });

    expect(input.value).toBe("Thanks @Ada Lovelace for the review.");
    root.remove();
  });

  it("saves it back as the reference, so an edit does not destroy the mention", async () => {
    const { root, input, submit, onSubmit } = mentionEditor({
      initialText: `Thanks @<${ADA}>.`,
      mentionNames: new Map([[ADA, "Ada Lovelace"]]),
    });

    input.value = `${input.value} Much appreciated.`;
    submit.click();
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledWith(`Thanks @<${ADA}>. Much appreciated.`);
    root.remove();
  });

  it("keeps a mention whose name nobody could resolve, rather than losing it", () => {
    const { root, input } = mentionEditor({ initialText: `Thanks @<${ADA}>.` });

    // Shown as stored is poor, but it still SAVES as the reference; a dropped token would not.
    expect(input.value).toBe(`Thanks @<${ADA}>.`);
    root.remove();
  });

  it("paints each mention over the field, since a textarea cannot colour its own text", () => {
    const { root, input } = mentionEditor({
      initialText: `Thanks @<${ADA}> and @<${GRACE}>.`,
      mentionNames: new Map([
        [ADA, "Ada Lovelace"],
        [GRACE, "Grace Hopper"],
      ]),
    });

    const painted = [...root.querySelectorAll(".awesomeado-text-editor__mention")].map(
      (run) => run.textContent,
    );
    expect(painted).toEqual(["@Ada Lovelace", "@Grace Hopper"]);
    // The FIELD keeps its own glyphs. Hiding them would make every character depend on the layer
    // landing in exactly the right place — and an editor is built detached, where nothing measures.
    expect(input.style.color).not.toBe("transparent");
    root.remove();
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
    typeText(input, "Some text.");

    submit.click();

    expect(submit.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
  });

  it("ignores a second submit while the first is still saving", () => {
    const pending = deferred();
    const onSubmit = vi.fn(() => pending.promise);
    const { input, submit } = openEditor("", onSubmit);
    typeText(input, "Some text.");

    submit.click();
    submit.dispatchEvent(new MouseEvent("click"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("re-enables the editor and says so when the save was refused", async () => {
    const { input, submit, cancel, failure } = openEditor(
      "",
      vi.fn(() => Promise.resolve(false)),
    );
    typeText(input, "Some text.");

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
    typeText(input, "Some text.");

    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(failure.style.display).toBe("none");
    expect(submit.disabled).toBe(true);
  });
});
