# notes

The per-item **Notes** panel on the Project Tracking board: a work item's Azure DevOps Discussion,
shown under its row and authored in place.

## Public API

```ts
import { renderNotesPanel } from "./notes/NotesPanel";

const notes = renderNotesPanel({
  doc,
  workItemId: item.id,
  sinceIso: noteWindowStart(services.now(), updatesWindowWeeks(properties)),
  services,
});

rowWrapper.append(notes.element);
notes.setExpanded(true); // triggers the first fetch
```

`renderNotesPanel(options)` returns `{ element, setExpanded, isExpanded }`.

| Option              | Meaning                                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workItemId`        | The item whose Discussion is shown.                                                                                                                                                                                                                                  |
| `sinceIso`          | Start of the binding's **Updates window (weeks)**; nothing older is fetched.                                                                                                                                                                                         |
| `services`          | The narrow notes slice of `EnhancedViewServices`: note read/write, mention resolution/search, current Marker Tags, and logging.                                                                                                                                      |
| `onNoteCountKnown`  | Called with the number of visible non-marker notes inside the window, once that becomes known and whenever it changes. Never called after a FAILED read — an unknown count must not be reported as none.                                                             |
| `showAllInWindow`   | Show **every** note inside the Updates window instead of only the two most recent days with notes. For a surface the reader opened to read the whole discussion (the item's right-click **View all notes**) rather than to glance at a row.                          |
| `onlyCommentPrefix` | Show **only** the notes beginning with this marker comment token, and no composer with them — what a row's marker pill opens. A note typed there would not carry the token, so it would vanish from the list it was written in.                                      |
| `onItemRevision`    | Called with the item's `System.Rev` after a note was stored. Azure DevOps records a note AS a work item revision, so an owner that does not fold this back onto its item has the reader's very next edit — a title, a sprint move, a status — refused as a conflict. |

## Behaviour

- The panel starts collapsed and fetches on the **first expand**, then keeps the result.
- **"+ Add note"** sits above the list; the list is newest-first, so a new note lands right under it.
- An expanded list shows the notes from the **two most recent days that have notes** — all of them,
  so a busy afternoon is never cut in half. Notes beginning with a configured marker `commentTag`
  are omitted from this inline glance. `showAllInWindow` lifts both limits and shows every note in
  the window, including marker-generated notes.
- A note reads `{author} {date} {text}` — all on **one line**. The author/date block floats left, so
  the note starts beside the name instead of spending a line of its own on the header, and anything
  that wraps past it hangs in by 12px so a multi-line note still reads as a single entry. The
  author's name is clickable **only on your own notes**
  (Azure DevOps rejects anyone else's edit); it is drawn with a hand cursor and a **dashed**
  underline, and clicking it opens the note for correction in place.
- Note text and the item description both render through the shared
  [`MarkdownText`](../../../../common/view-common/control/MarkdownText/README.md) control.
- `@`-mentions in the fetched notes are resolved in **one** bulk call before the rows are built, so a
  mention reads as the person's name rather than a placeholder. ADO's own `renderedText` already
  carries names; this is what covers the notes it did not render — including a note **you just
  wrote**, which ADO hands back without any rendering at all.
- A note that opens with a configured marker `commentTag` shows that prefix as **inline code**, so
  the token reads as the marker it is rather than as the first words of the note. Display only —
  opening the note for correction still shows the source exactly as Azure DevOps stores it.

## Files

| File                                                                                              | Role                                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `NotesPanel.ts`                                                                                   | The panel: fetch-on-expand, list rendering, write handling.                      |
| `NoteRow.ts`                                                                                      | One note, and the edit affordance on the author's name.                          |
| `NoteComposer.ts`                                                                                 | The "+ Add note" link and the editor it swaps in.                                |
| `markerNotes.ts`                                                                                  | Configured marker-comment prefixes, their exact match, and their code rendering. |
| Adding and correcting a note both use the shared                                                  |
| [`TextEditor`](../../../../common/view-common/control/TextEditor/README.md) control, so a note is |
| authored with the same field, shortcuts and failure reporting as every other in-place edit.       |
