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

/** The hints each shape carries, naming the keyboard shortcuts the editor actually honours. */
const MULTILINE_HINT = "Markdown supported. Ctrl+Enter to save, Esc to cancel.";
const SINGLE_LINE_HINT = "Enter to save, Esc to cancel.";

/** How tall the Markdown box opens when the caller does not say — enough for a note. */
const DEFAULT_ROWS = 3;

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
  const input = createField(doc, options, singleLine);

  const failure = doc.createElement("span");
  failure.className = "awesomeado-text-editor__error";
  failure.style.cssText = ["display:none", "font-size:11px", "color:#d13438"].join(";");

  const submit = createButton(doc, options.submitLabel, true);
  const cancel = createButton(doc, "Cancel", false);
  const buttons = doc.createElement("div");
  buttons.style.cssText = ["display:flex", "gap:6px", "align-items:center"].join(";");
  buttons.append(submit, cancel, failure);

  root.append(input, buttons);

  let saving = false;
  const save = (): void => {
    const text = input.value.trim();
    if (saving || (text.length === 0 && options.allowEmpty !== true)) {
      return;
    }
    saving = true;
    submit.disabled = true;
    cancel.disabled = true;
    failure.style.display = "none";
    void options.onSubmit(text).then((saved) => {
      saving = false;
      if (saved) {
        return;
      }
      // The caller keeps the editor mounted on failure, so re-enable it rather than leaving the
      // author looking at their own unsaved words behind dead buttons.
      submit.disabled = false;
      cancel.disabled = false;
      failure.textContent = "Not saved — see the diagnostics log.";
      failure.style.display = "inline";
    });
  };

  submit.addEventListener("click", save);
  cancel.addEventListener("click", () => options.onCancel());
  // Typed through `HTMLElement` because a `<input> | <textarea>` union collapses `addEventListener`
  // onto its bare-`Event` overload, which knows nothing about keys.
  (input as HTMLElement).addEventListener("keydown", (event) => {
    // A bare Enter commits a one-line field (there is no newline to insert) but must not commit a
    // Markdown box, where it is how paragraphs are written.
    if (event.key === "Enter" && (singleLine || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      options.onCancel();
    }
    // Typing inside an enhanced view must never reach ADO's page shortcuts underneath it.
    event.stopPropagation();
  });

  // Deferred so the element is in the document before it is asked to take focus.
  setTimeout(() => input.focus(), 0);

  return root;
}

/** The field itself: a one-line `input` or the multi-line Markdown `textarea`. */
function createField(
  doc: Document,
  options: TextEditorOptions,
  singleLine: boolean,
): HTMLInputElement | HTMLTextAreaElement {
  // Themed field: ADO's own surface and border tokens so the box reads on light, dark and
  // Follow-ADO alike, with a fixed fallback for the tokens a theme may not define.
  const styles = [
    "width:100%",
    "box-sizing:border-box",
    "font:inherit",
    "font-size:11px",
    "padding:4px 6px",
    "border:1px solid var(--palette-neutral-20, rgba(128,128,128,0.45))",
    "border-radius:3px",
    "background:var(--callout-background-color, rgba(128,128,128,0.08))",
    "color:var(--text-primary-color, #323130)",
  ];

  let input: HTMLInputElement | HTMLTextAreaElement;
  if (singleLine) {
    const line = doc.createElement("input");
    line.type = "text";
    input = line;
  } else {
    const box = doc.createElement("textarea");
    box.rows = options.rows ?? DEFAULT_ROWS;
    styles.push("resize:vertical");
    input = box;
  }

  input.className = "awesomeado-text-editor__input";
  input.value = options.initialText;
  if (options.maxLength !== undefined) {
    input.maxLength = options.maxLength;
  }
  input.placeholder = options.placeholder ?? (singleLine ? SINGLE_LINE_HINT : MULTILINE_HINT);
  input.style.cssText = styles.join(";");
  return input;
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
      ? "border:1px solid var(--communication-background, #0078d4)"
      : "border:1px solid var(--palette-neutral-20, rgba(128,128,128,0.45))",
    primary ? "background:var(--communication-background, #0078d4)" : "background:transparent",
    primary
      ? "color:var(--text-on-communication-background, #fff)"
      : "color:var(--text-primary-color, #323130)",
  ].join(";");
  return button;
}
