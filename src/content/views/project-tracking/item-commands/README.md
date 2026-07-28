# item-commands

The per-item commands the Project Tracking board hangs off a **right-click**, shown under a rule
beneath the three every item menu carries (Copy Item ID / Copy ADO Url / Open in ADO).

| Command                    | Does                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Update title**           | Opens a one-line editor on `System.Title`                                            |
| **Update description**     | Opens a Markdown editor on `System.Description`, and saves the field as Markdown     |
| **Move to another sprint** | A submenu of the current sprint and every future one, writing `System.IterationPath` |
| **View all notes**         | The item's whole discussion inside the Updates window — read, correct, add           |

## Usage

```ts
import { buildItemCommands } from "./item-commands/ItemCommands";

contextMenu.openAt(event, {
  id: item.id,
  url: buildWorkItemUrl(location.href, item.id),
  commands: buildItemCommands({
    doc,
    item,
    services,
    queue: boardWriteQueue,
    sprintWindow,
    notesSinceIso: noteWindowStart(services.now(), updatesWindowWeeks(properties)),
    onChanged: repaintBoard,
  }),
});
```

`buildItemCommands(options)` returns `ItemContextMenuCommand[]` for the shared
[`ItemContextMenu`](../../../../common/view-common/control/ItemContextMenu/README.md).

| Option          | Meaning                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `item`          | The item the commands act on. **Mutated in place** on a successful write, like every row control.     |
| `services`      | `EnhancedViewServices` — supplies the note loader/writer, the mention directory and the logger.       |
| `queue`         | The board's single `WorkItemWriteQueue`, so these edits cannot race the row controls on `System.Rev`. |
| `sprintWindow`  | The team's sprint window; the move submenu is built from its current and future entries.              |
| `notesSinceIso` | Start of the binding's **Updates window (weeks)** — how far back **View all notes** reaches.          |
| `onChanged`     | Repaints the board, so a changed title or sprint shows without a re-read.                             |

## Behaviour

- **Persist first, reflect second**, like every other editable control on the board: nothing on
  screen changes until Azure DevOps has accepted the write, so a rejected save can never leave a
  value on the board that was never stored. The editor stays open with the author's words in it and
  says _"Not saved — see the diagnostics log."_
- **The item's `rev` is updated here**, not by each command, because every later write to the same
  item is tested against it — a command that forgot would make its next edit fail as a concurrency
  conflict against its own change.
- **Only forward sprints are offered.** Moving work backwards into a sprint already reported on
  rewrites history rather than plans it. The sprint the item is already on is left out too: it is not
  a move, and listing it invites the click that does nothing. With nothing left to offer, the command
  stays visible but inert and says so.
- **A description is saved as Markdown.** The write carries the field's storage format, because a
  multiline field left on ADO's default (`Html`) stores Markdown source verbatim — asterisks and all.
  The editor opens on the field's stored **source**, whatever that is, since that is what the save
  replaces.
- **A title is required, a description is not**, so the description editor accepts an empty box and
  the title editor does not.
- **View all notes** shows every note the window holds, unlike the panel under a row, which shows the
  two most recent days with notes because dozens of those are on screen at once. It opens **centred**
  at ~70% of the window, because the pointer's position stops being a useful place to put a surface
  that size, and what it holds has no natural size — it is however much discussion an item has.
- **Every panel is headed by the item's number**, as the link that opens it in Azure DevOps. A panel
  opened from a right-click has nothing else to identify itself with: the menu covers the row it came
  from, and a box holding one field's text looks the same for every item on the board. The item's
  **title** sits under the number everywhere except the panel that edits the title, where it would
  only show the same words twice — one of them about to be wrong.
