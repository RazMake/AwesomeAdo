# ItemContextMenu Control

The board-wide **right-click menu** for a work item. One instance serves every row a view renders;
rows call it from their own `contextmenu` listener with the item they stand for.

Commands (in order, identical in every view):

| Command          | Does                                                      |
| ---------------- | --------------------------------------------------------- |
| **Copy Item ID** | Writes the item's id to the clipboard                     |
| **Copy ADO Url** | Writes the item's Azure DevOps deep link to the clipboard |
| **Open in ADO**  | Opens that link in a new tab — drawn in an accent color   |

## Usage

```typescript
import { createItemContextMenu } from "path/to/ItemContextMenu";

// Once per view. `mountInto` must be an element the view discards on teardown.
const contextMenu = createItemContextMenu({
  doc: document,
  mountInto: boardRoot,
  logger: services.logger,
});

// Once per row.
row.addEventListener("contextmenu", (event) => {
  contextMenu.openAt(event, { id: item.id, url: buildWorkItemUrl(location.href, item.id) });
});
```

## Public API

### `createItemContextMenu(options): ItemContextMenu`

- **`doc: Document`** — The document the menu is built in and dismissed from.
- **`mountInto: HTMLElement`** — Where the menu's pointer anchor is mounted. Pass an element the
  **owning view** discards when it is torn down (its board root, not `document.body`): the anchor
  outlives any single repaint, so mounting it on the document would strand one invisible node per
  view that ever opened a menu.
- **`logger: ILogger`** — Records a clipboard write that never landed.

### `ItemContextMenu`

- **`openAt(event: MouseEvent, target: ItemContextMenuTarget): void`** — Opens the menu at the
  pointer, replacing whatever was open. Suppresses the browser's own menu and stops the event.
- **`close(): void`** — Closes the menu if open (idempotent).

### `ItemContextMenuTarget`

- **`id: number`** — The work item's id, copied by **Copy Item ID**.
- **`url: string | null`** — The item's Azure DevOps deep link. `null` leaves **Copy ADO Url** and
  **Open in ADO** dimmed and inert, with a tooltip saying why, rather than removing them — a menu
  whose commands stay in the same place is easier to use than one that changes shape per row.
- **`commands?: ItemContextMenuCommand[]`** — Commands specific to this item, shown under a rule
  beneath the three above. Supplied by the caller rather than built here so the menu stays a **menu**:
  what it means to rename a work item, where its description is persisted and which sprints it may
  move to are facts about the owning view's data.

### `ItemContextMenuCommand`

Exactly one of `run`, `panel` and `submenu` gives a command its behaviour.

| Field            | Meaning                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`          | The row's text.                                                                                                                                                  |
| `run`            | `() => void` — runs the command and closes the menu.                                                                                                             |
| `panel`          | `(close) => HTMLElement` — **replaces** the menu's commands with this element (an editor, a list). `close` dismisses the whole menu.                             |
| `centerPanel`    | Centres the panel in the window instead of anchoring it to the pointer, for a panel big enough that the pointer's position stops being a useful place to put it. |
| `submenu`        | `() => ItemContextMenuCommand[]` — nested commands in a flyout beside the row. Built **on open**, so it can read live state.                                     |
| `declarations`   | `[property, value][]` applied to the label (e.g. a sprint's relation color).                                                                                     |
| `disabledReason` | Dims the row and makes it inert, with this as the tooltip. Overrides the three above.                                                                            |

## Notes

- **Nested rows just work.** `openAt` stops the event, so the innermost row under the pointer wins.
  That matters wherever a row is rendered inside another one — the rolled-up children popup lives
  inside its parent's row.
- **Dismissal and on-screen behaviour** come from [`popupHost`](../popupHost/README.md): an outside
  click or Escape closes the menu, and it is shifted or flipped to stay fully visible. The menu is
  anchored to the pointer through a zero-sized, viewport-fixed anchor moved on each open, because
  the host's corrections are written against a trigger element rather than a coordinate.
- **A failed copy is never silent in Diagnostics.** The clipboard write can be refused (the page lost
  focus, access denied) after the menu has already closed, so the rejection is logged.
- **The hover highlight and the menu's edge are fixed translucent greys**, not neutral palette
  tokens. Under **Follow ADO** those tokens resolve to ADO's own surface colors — the ones the menu
  is already painted with — so the highlighted command vanished into the menu on that theme.
- **A panel takes over the menu** rather than opening a second popup, so one thing is on screen and
  the host's dismissal contract covers the editor too. The menu is pulled back inside the window
  afterwards, because the host measured it when it held three short rows — unless `centerPanel` put
  it in the middle of the window instead.
- **A flyout flips to the other side** of its row when it would open past the window's right edge.
- **The menu is sized from its own rows** (`width:max-content`), so no command label wraps: it is
  positioned inside a zero-width anchor, where shrink-to-fit would collapse it onto its `min-width`.
- **Escape inside an editor belongs to the editor.** The menu passes `dismissOnFieldEscape: false` to
  the host, so the first Escape abandons what is being typed and the second dismisses the menu.
