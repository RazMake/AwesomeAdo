import { MULTILINE_HINT, SINGLE_LINE_HINT, renderMarkdownField } from "./MarkdownField";
import type { TextEditorMentionOptions } from "./MentionSuggestions";

/** What the editor starts with, how it is shaped, and what it does with what the author types. */
export interface TextEditorOptions {
  /** The text the editor opens on: empty for a new value, the existing source for a correction. */
  initialText: string;
  /** The confirm button's label ("Add" / "Save"). */
  submitLabel: string;
  /**
   * A one-line field (a title) instead of the multi-line Markdown box. Defaults to multi-line, which
   * is what every long-form value here wants.
   */
  singleLine?: boolean;
  /** How many characters the field accepts; omitted leaves the browser's own (unbounded) limit. */
  maxLength?: number;
  /**
   * How many lines the multi-line box opens at. Defaults to 3, which suits a note; give a value to
   * a field whose content is normally longer, so the author can see what they are rewriting instead
   * of scrolling a slot. Ignored for a one-line field.
   */
  rows?: number;
  /** The field's hint text; omitted uses the hint that matches the shape. */
  placeholder?: string;
  /** Enables typed `@` identity suggestions for a Markdown field. Ignored for a one-line field. */
  mentions?: TextEditorMentionOptions;
  /**
   * Whether submitting nothing is meaningful. False (the default) makes the empty field inert, which
   * is right for a value that must exist; true lets an author CLEAR one that need not.
   */
  allowEmpty?: boolean;
  /**
   * Save the text. Resolving `true` closes the editor; `false` keeps it open with the author's words
   * still in it, so a rejected write never costs them what they wrote.
   */
  onSubmit(text: string): Promise<boolean>;
  /** Abandon the edit and put the surface back the way it was. */
  onCancel(): void;
}

/**
 * The themed text editor shared by every in-place edit: adding a note, correcting one, renaming an
 * item, rewriting its description.
 *
 * One editor for all of them because they differ only in the text they open on, the shape of the
 * field, and the word on the button — separate near-identical boxes would drift in exactly the
 * details that matter (the keyboard shortcuts, the disabled-while-saving state, where a failure is
 * reported), and each one that drifted would teach the reader a slightly different set of rules.
 */
export function renderTextEditor(doc: Document, options: TextEditorOptions): HTMLElement {
  const root = doc.createElement("div");
  root.className = "awesomeado-text-editor";
  root.style.cssText = ["display:flex", "flex-direction:column", "gap:4px", "margin:2px 0"].join(
    ";",
  );

  const singleLine = options.singleLine === true;
  const failure = doc.createElement("span");
  failure.className = "awesomeado-text-editor__error";
  failure.style.cssText = ["display:none", "font-size:11px", "color:var(--error)"].join(";");

  const submit = createButton(doc, options.submitLabel, true);
  const cancel = createButton(doc, "Cancel", false);
  const buttons = doc.createElement("div");
  buttons.style.cssText = ["display:flex", "gap:6px", "align-items:center"].join(";");
  buttons.append(submit, cancel, failure);

  let saving = false;
  const refreshSubmit = (): void => {
    const hasRequiredText = options.allowEmpty === true || field.input.value.trim().length > 0;
    submit.disabled = saving || !hasRequiredText;
  };

  const field = renderMarkdownField(doc, {
    initialText: options.initialText,
    singleLine,
    maxLength: options.maxLength,
    rows: options.rows,
    placeholder: options.placeholder ?? (singleLine ? SINGLE_LINE_HINT : MULTILINE_HINT),
    mentions: options.mentions,
    onInput: () => refreshSubmit(),
  });
  root.append(field.element, buttons);
  refreshSubmit();

  const save = (): void => {
    if (saving || (field.input.value.trim().length === 0 && options.allowEmpty !== true)) {
      return;
    }
    saving = true;
    refreshSubmit();
    cancel.disabled = true;
    failure.style.display = "none";
    void options.onSubmit(field.storedText().trim()).then((saved) => {
      saving = false;
      if (saved) {
        return;
      }
      // The caller keeps the editor mounted on failure, so re-enable it rather than leaving the
      // author looking at their own unsaved words behind dead buttons.
      refreshSubmit();
      cancel.disabled = false;
      failure.textContent = "Not saved \u2014 see the diagnostics log.";
      failure.style.display = "inline";
    });
  };

  wireEditorEvents({
    input: field.input,
    submit,
    cancel,
    singleLine,
    save,
    onCancel: options.onCancel,
  });

  return root;
}

function wireEditorEvents(options: {
  input: HTMLInputElement | HTMLTextAreaElement;
  submit: HTMLButtonElement;
  cancel: HTMLButtonElement;
  singleLine: boolean;
  save(): void;
  onCancel(): void;
}): void {
  const { input } = options;
  options.submit.addEventListener("click", options.save);
  options.cancel.addEventListener("click", options.onCancel);
  // Registered after the field's own handler, which stops a key it already spent on a mention pick
  // or a Markdown shortcut from ever reaching this one.
  (input as HTMLElement).addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (options.singleLine || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      options.save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      options.onCancel();
    }
    event.stopPropagation();
  });
  setTimeout(() => input.focus(), 0);
}

/** A compact themed button; `primary` marks the confirming one. */
function createButton(doc: Document, label: string, primary: boolean): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = [
    "cursor:pointer",
    "font:inherit",
    "font-size:11px",
    "padding:2px 8px",
    "border-radius:3px",
    primary
      ? "border:1px solid var(--communication-background)"
      : "border:1px solid var(--palette-neutral-20)",
    primary ? "background:var(--communication-background)" : "background:transparent",
    primary ? "color:var(--text-on-communication-background)" : "color:var(--text-primary-color)",
  ].join(";");
  return button;
}
