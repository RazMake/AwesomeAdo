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
  loader: services.noteLoader,
  writer: services.noteWriter,
  mentionDirectory: services.mentionDirectory,
  logger: services.logger,
});

rowWrapper.append(notes.element);
notes.setExpanded(true); // triggers the first fetch
```

`renderNotesPanel(options)` returns `{ element, setExpanded, isExpanded }`.

| Option             | Meaning                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workItemId`       | The item whose Discussion is shown.                                                                                                                                                                                                         |
| `sinceIso`         | Start of the binding's **Updates window (weeks)**; nothing older is fetched.                                                                                                                                                                |
| `loader`           | `IWorkItemNoteLoader` — reads the notes and the signed-in reader.                                                                                                                                                                           |
| `writer`           | `IWorkItemNoteWriter` — posts new notes and rewrites the reader's own.                                                                                                                                                                      |
| `mentionDirectory` | `IMentionDirectory` — names the people the fetched notes `@`-mention. Asked once per load, for every mention across those notes.                                                                                                            |
| `logger`           | Records each expand/collapse flip and what it did.                                                                                                                                                                                          |
| `onNoteCountKnown` | Called with the number of notes actually inside the window, once that becomes known and whenever it changes. Never called after a FAILED read — an unknown count must not be reported as none.                                              |
| `showAllInWindow`  | Show **every** note inside the Updates window instead of only the two most recent days with notes. For a surface the reader opened to read the whole discussion (the item's right-click **View all notes**) rather than to glance at a row. |

## Behaviour

- The panel starts collapsed and fetches on the **first expand**, then keeps the result.
- **"+ Add note"** sits above the list; the list is newest-first, so a new note lands right under it.
- An expanded list shows the notes from the **two most recent days that have notes** — all of them,
  so a busy afternoon is never cut in half. `showAllInWindow` lifts that to every note in the window.
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

## Files

| File              | Role                                                        |
| ----------------- | ----------------------------------------------------------- |
| `NotesPanel.ts`   | The panel: fetch-on-expand, list rendering, write handling. |
| `NoteRow.ts`      | One note, and the edit affordance on the author's name.     |
| `NoteComposer.ts` | The "+ Add note" link and the editor it swaps in.           |

Adding and correcting a note both use the shared
[`TextEditor`](../../../../common/view-common/control/TextEditor/README.md) control, so a note is
authored with the same field, shortcuts and failure reporting as every other in-place edit.
