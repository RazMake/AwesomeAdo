# item-commands

The per-item commands the Project Tracking board hangs off a **right-click**, shown under a rule
beneath the three every item menu carries (Copy Item ID / Copy ADO Url / Open in ADO).

| Command                    | Does                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Update title**           | Opens a one-line editor on `System.Title`                                            |
| **Update description**     | Opens a Markdown editor on `System.Description`, and saves the field as Markdown     |
| **Move to another sprint** | A submenu of the current sprint and every future one, writing `System.IterationPath` |
| **Change area path**       | A submenu of the board's other area paths, writing `System.AreaPath`                 |
| **View all notes**         | The item's whole discussion inside the Updates window — read, correct, add           |

Under a **second** rule, the marker flags (`buildMarkerCommands`):

| Command                                | Does                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Tag with** _Blocked (internal)_      | Asks for a mandatory reason, then writes the team's ADO tag **and** that reason as a comment in one patch |
| **Tag with** _Blocked by another team_ | The same, with that marker's configured tag and comment token                                             |
| **Clear** _‹marker›_                   | Shown instead when the item already wears the tag; removes it, no reason asked                            |

The marker's name is drawn as the very [`MarkerPill`](../../../../common/view-common/control/MarkerPill/README.md)
the item will wear, so the command previews its own result.

Sprint View passes an `InterruptCommandState` as the optional second argument. That opt-in adds
Tag/Accept/Clear Interrupt commands and updates the supplied accepted-ID set after a committed
write. Project Tracking omits the argument, so Interrupt mutation remains unavailable there.

## Usage

```ts
import { buildItemCommands } from "./item-commands/ItemCommands";
import { buildMarkerCommands } from "./item-commands/MarkerCommands";

const target = { doc, item, services, queue: boardWriteQueue, onChanged: repaintBoard };

contextMenu.openAt(event, {
  id: item.id,
  url: buildWorkItemUrl(location.href, item.id),
  commands: [
    ...buildItemCommands({
      ...target,
      sprintWindow,
      areaPaths,
      notesSinceIso: noteWindowStart(services.now(), updatesWindowWeeks(properties)),
    }),
    // Opt-in: a view with no notion of "stuck work" simply never asks for these.
    ...buildMarkerCommands(target),
  ],
});
```

`buildItemCommands(options)` and `buildMarkerCommands(target)` both return
`ItemContextMenuCommand[]` for the shared
[`ItemContextMenu`](../../../../common/view-common/control/ItemContextMenu/README.md).

Two further entry points exist so other views can reuse parts of this menu without inheriting the
board-specific destinations:

- `buildItemEditingCommands(options)` — just **Update title**, **Update description** and **View all
  notes**. Takes an `ItemCommandTarget` plus `notesSinceIso`; no sprint window and no area paths, so
  a view with neither can still offer the three commands that edit the item itself.
- `buildProjectLifecycleCommands(options)` (`ProjectLifecycleCommands.ts`) — **Create Project Query**
  and **Mark completed**, the two commands that govern a catalog entry rather than a work item's
  fields. Each is offered independently (`offerCreate` / `offerComplete`): the All Projects Catalog
  View offers **Create Project Query** on every row and **Mark completed** on its projects, while
  this view offers only **Mark completed** on its own title — the board already IS the query.
- `buildNewChildCommand(label, options)` (`NewChildCommands.ts`) — the one command that **creates**
  something: **Add new milestone/phase** on the board's title (and on a project row of the All
  Projects Catalog View), **New work identified** on a row whose
  children are the team's delivery. Same builder, different label, because both add an item of the
  parent type's first configured child type. The file also exports `childTypeOf`,
  `isImmediateParentOfPrimaryWork` (which rows may offer it), `newChildSummary` (the line stating
  what the reader is not being asked to type) and `newChildItem` (the in-memory item the created one
  is shown as, ranked ahead of its level).

| Option          | Meaning                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `item`          | The item the commands act on. **Mutated in place** on a successful write, like every row control.                                                                                    |
| `services`      | `EnhancedViewServices` — the note loader/writer, the mention directory, the marker tags, the logger.                                                                                 |
| `queue`         | The board's single `WorkItemWriteQueue`, so these edits cannot race the row controls on `System.Rev`.                                                                                |
| `onChanged`     | Repaints the board, so a changed title, sprint or flag shows without a re-read.                                                                                                      |
| `sprintWindow`  | (editing commands) The team's sprint window; the move submenu is built from its current and future entries.                                                                          |
| `areaPaths`     | (editing commands) The same eligible full paths offered by the board's area-path filter.                                                                                             |
| `notesSinceIso` | (editing commands) Start of the binding's **Updates window (weeks)** — how far back **View all notes** reaches.                                                                      |
| `types`         | (lifecycle) The configured type catalog, from which a completed project's final state is read.                                                                                       |
| `queryLink`     | (lifecycle) The project's tracking query, or `null` when it owns none. Its `managed` flag says whether this extension created it; only a managed query is ever offered for deletion. |     | `queryLinkKnown` | (lifecycle) Whether a `null` link means "owns none" rather than "the read that would have found one failed". |     | `queryFolderPath` | (lifecycle) The folder a new tracking query is created in. |
| `offerCreate`   | (lifecycle) Whether **Create Project Query** appears at all — false where the board already is one.                                                                                  |
| `offerComplete` | (lifecycle) Whether **Mark completed** appears at all — false on work beneath a project, which is finished on the board that tracks it.                                              |
| `onReload`      | (lifecycle) Re-reads the surface after a change the loaded data cannot represent.                                                                                                    |

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
- **Area-path names match the filter.** The submenu uses the filter's full eligible path list and
  its shortest-unique-suffix naming rule. Labels are disambiguated before the item's current path is
  omitted, so a remaining option cannot become shorter than the same path in the filter. Hovering a
  destination shows its full path; choosing one writes `System.AreaPath` through the board's shared
  queue and repaints only after Azure DevOps accepts it.
- **A description is saved as Markdown.** The write carries the field's storage format, because a
  multiline field left on ADO's default (`Html`) stores Markdown source verbatim — asterisks and all.
  The editor opens on the field's stored **source**, whatever that is, since that is what the save
  replaces.
- **A title is required, a description is not**, so the description editor accepts an empty box and
  the title editor does not.
- **View all notes** shows every note the window holds, unlike the panel under a row, which shows the
  two most recent days with notes because dozens of those are on screen at once. It opens **centred**
  at ~70% of the window, because the pointer's position stops being a useful place to put a surface
  that size, and what it holds has no natural size — it is however much discussion an item has. Its
  maximize button stretches the discussion to a `10px` inset inside the enhanced-view surface, so
  ADO's top and left bars remain uncovered; restore returns it to the centred size.
- **Every panel is headed by the item's number**, as the link that opens it in Azure DevOps. A panel
  opened from a right-click has nothing else to identify itself with: the menu covers the row it came
  from, and a box holding one field's text looks the same for every item on the board. The item's
  **title** sits under the number everywhere except the panel that edits the title, where it would
  only show the same words twice — one of them about to be wrong.
- **A flag and the reason for it are ONE patch.** "Blocked" with no reason is a question, not an
  answer, so the reason is mandatory — and it is written as a `System.History` op in the same JSON
  Patch as `System.Tags`, not posted as a separate comment. Posting a comment creates its own work
  item revision, which would leave the tag patch testing a rev that has already moved and rejected
  with `HTTP 412` every time. One patch means one revision: both land or neither does, so the item
  can never carry a flag nobody can explain. If the patch is refused the editor stays open with the
  author's words in it. See the `batch-work-item-writes` skill.
- **Clearing a flag asks for nothing.** Deliberately asymmetric: applying one is about to tell the
  whole board the item is stuck, whereas removing it only says that is no longer true — and a
  mandatory box in the way of that would leave stale flags on the board rather than prevent them.
- **Completing a project always asks first**, through the shared
  [`ConfirmPanel`](../../../../common/view-common/control/ConfirmPanel/README.md), so it reads the
  same on the catalog row and on the Project Tracking title. The panel names the exact state the
  project will land in and says what happens to its tracking query. When the query link could not be
  read — a refused or failed secondary request — it says so instead of claiming there is nothing to
  clean up, and **Create Project Query** is disabled for the same reason: neither command may treat
  "unknown" as "none".
- **Adding is asked for once and stated in full.** The create commands open a box only for the
  title; the parent, area path and iteration are inherited from the parent item and named in the
  summary line, because work identified under an item belongs where that item is until someone moves
  it deliberately. **New work identified** appears only where the children ARE the team's delivery:
  offering it on planning context above that would create structure under the guise of finding work,
  and below it would create implementation detail nobody asked for.
- **A marker the team never configured stays visible but inert**, saying where to set it, rather than
  vanishing from the menu: settings the reader cannot see from here must not silently change what
  the menu contains.
- **The comment carries the team's own token** (`[BLOCKED]`, `[ACCEPTED]`, …) so the note reads like
  their existing ones. A team that configured no token gets the bare comment, not a stray space.
- **A tag write names the tags it was derived from.** Several things advance an item's `System.Rev`
  without ever reporting the new one — a drag-reorder, the rank fallback, a note posted from the
  panel — so the board's cached rev goes stale on its own and the next flag is refused with
  `HTTP 412` until the board is reloaded. Passing the current tags as the change's `baseValue` lets
  the write be retried once against the rev the server just reported, but only while the tags are
  still the ones the change was computed from: a concurrent change to the tags themselves is still
  reported as the conflict it is, rather than silently overwritten. Every editing command does the
  same with the value it is replacing (the title, the description, the sprint), so no command in this
  menu is left needing a board reload to work.

## Project lifecycle

- **Creating a query is three steps, each only after the last one landed**: Azure DevOps creates the
  saved query, the project gets a stamped `Hyperlink` to it, and AwesomeADO records the binding that
  opens it in Project Tracking View. A failed link deletes the query it just made, because a query
  nothing points at is invisible litter in a shared folder. A failed binding is deliberately NOT
  rolled back: the query exists and is reachable either way, so the worst case is one the user
  enables the enhanced view on by hand.
- **The command is disabled, not hidden, once a project owns a query.** Creating a second is not an
  undo — it would leave the first linked and bound with nothing pointing at it.
- **"Completed" is the team's own word.** The state written is the primary Azure DevOps state of the
  LAST board column configured for that item's type; a type with no columns leaves the command
  visible but inert rather than guessing at "Closed".
- **Deleting the query is asked, never assumed.** A completed project's query is usually clutter, but
  a team that reports on finished work would lose that report with no way back. The state change goes
  first: a completion whose cleanup failed is recoverable, whereas a query deleted for a project that
  was never completed is not. The binding is dropped only once the query is actually gone.
- **The link is located at removal time, not remembered.** JSON Patch addresses a relation by index,
  and an index read minutes ago is exactly what a concurrent edit invalidates — so the worker reads
  the item's relations and removes the matching link in one round trip, guarded by both the revision
  and the link's own URL. A project that carries no link still has its query deleted.
