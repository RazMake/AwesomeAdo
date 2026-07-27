import { MAX_NOTE_LENGTH } from "../../../../common/ado/WorkItemNote";

/** What the editor starts with and what it does with what the author types. */
export interface NoteEditorOptions {
  /** The text the editor opens on: empty for a new note, the existing source for a correction. */
  initialText: string;
  /** The confirm button's label ("Add" / "Save"). */
  submitLabel: string;
  /**
   * Save the text. Resolving `true` closes the editor; `false` keeps it open with the author's words
   * still in it, so a rejected write never costs them what they wrote.
   */
  onSubmit(text: string): Promise<boolean>;
  /** Abandon the edit and put the panel back the way it was. */
  onCancel(): void;
}

/**
 * The inline Markdown editor shared by "add a note" and "correct my note".
 *
 * One editor for both because they differ only in the text they open on and the word on the button —
 * two near-identical textareas would drift in exactly the details that matter (the keyboard
 * shortcuts, the disabled-while-saving state, where a failure is reported).
 */
export function renderNoteEditor(doc: Document, options: NoteEditorOptions): HTMLElement {
  const root = doc.createElement("div");
  root.className = "awesomeado-note-editor";
  root.style.cssText = ["display:flex", "flex-direction:column", "gap:4px", "margin:2px 0"].join(
    ";",
  );

  const input = doc.createElement("textarea");
  input.className = "awesomeado-note-editor__input";
  input.value = options.initialText;
  input.rows = 3;
  input.maxLength = MAX_NOTE_LENGTH;
  input.placeholder = "Markdown supported. Ctrl+Enter to save, Esc to cancel.";
  // Themed field: ADO's own surface and border tokens so the box reads on light, dark and
  // Follow-ADO alike, with a fixed fallback for the tokens a theme may not define.
  input.style.cssText = [
    "width:100%",
    "box-sizing:border-box",
    "font:inherit",
    "font-size:11px",
    "padding:4px 6px",
    "border:1px solid var(--palette-neutral-20, rgba(128,128,128,0.45))",
    "border-radius:3px",
    "background:var(--callout-background-color, rgba(128,128,128,0.08))",
    "color:var(--text-primary-color, #323130)",
    "resize:vertical",
  ].join(";");

  const failure = doc.createElement("span");
  failure.className = "awesomeado-note-editor__error";
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
    if (saving || text.length === 0) {
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
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      options.onCancel();
    }
    // Typing inside the board must never reach ADO's page shortcuts underneath it.
    event.stopPropagation();
  });

  // Deferred so the element is in the document before it is asked to take focus.
  setTimeout(() => input.focus(), 0);

  return root;
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
