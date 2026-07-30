import { MAX_NOTE_LENGTH } from "../../../../common/ado/WorkItemNote";
import type { TextEditorMentionOptions } from "../../../../common/view-common/control/TextEditor/MentionSuggestions";
import { renderTextEditor } from "../../../../common/view-common/control/TextEditor/TextEditor";

/** What the composer posts and what it does afterwards. */
export interface NoteComposerOptions {
  /** Identity search used by the editor's typed `@` suggestions. */
  mentions: TextEditorMentionOptions;
  /**
   * Post the typed text. Resolving `true` closes the composer (the panel then re-renders with the
   * new note); `false` leaves it open with the author's words intact.
   */
  onSubmit(text: string): Promise<boolean>;
}

/**
 * The "+ Add note" affordance that pins to the top of a notes list.
 *
 * A link rather than a permanently-open textarea: every item on the board carries one, and a stack
 * of empty input boxes would bury the notes they exist to add to. It sits above the list because the
 * list is newest-first — the new note is about to appear directly beneath it.
 */
export function renderNoteComposer(doc: Document, options: NoteComposerOptions): HTMLElement {
  const root = doc.createElement("div");
  root.className = "awesomeado-note-composer";

  const trigger = doc.createElement("button");
  trigger.className = "awesomeado-note-composer__trigger";
  trigger.type = "button";
  // A non-breaking space keeps "+" welded to "Add note" if the row wraps.
  trigger.textContent = "+\u00A0Add note";
  trigger.style.cssText = [
    "cursor:pointer",
    "border:none",
    "background:none",
    "padding:0",
    "font:inherit",
    "font-size:11px",
    "opacity:0.75",
    "color:var(--communication-foreground)",
  ].join(";");

  const close = (): void => {
    root.replaceChildren(trigger);
  };

  trigger.addEventListener("click", () => {
    root.replaceChildren(
      renderTextEditor(doc, {
        initialText: "",
        submitLabel: "Add",
        maxLength: MAX_NOTE_LENGTH,
        mentions: options.mentions,
        // The composer closes ITSELF on success. The panel only rebuilds its list, so leaving that
        // to the caller would strand the author looking at a spent editor still holding the note
        // they had just posted — which reads as "it did not save" and invites a second one.
        onSubmit: (text) =>
          options.onSubmit(text).then((saved) => {
            if (saved) {
              close();
            }
            return saved;
          }),
        onCancel: close,
      }),
    );
  });

  root.append(trigger);
  return root;
}
