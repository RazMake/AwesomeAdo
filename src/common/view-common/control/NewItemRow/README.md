# NewItemRow

The inline row a list grows at the top of itself while a new work item is being added: a type icon,
a one-line title box, and a sentence stating everything the reader is **not** being asked to type.

## Usage

```ts
import { renderNewItemRow } from "../../common/view-common/control/NewItemRow/NewItemRow";

const row = renderNewItemRow({
  doc,
  typeName: "Feature",
  iconUrl: typeEntry?.icon ?? null,
  color: workItemTypeColor(typeEntry?.color),
  summary: 'Created as a Feature under "Payments", in area Fabrikam\\Core.',
  onSubmit: (title) => addItem(title), // false keeps the box open with the title still in it
  onCancel: () => closeTheRow(),
});
```

| Option     | Meaning                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| `typeName` | The type the item is created as. Names the button (`Add Feature`) and the placeholder.   |
| `iconUrl`  | The type's ADO icon, or `null` for the neutral glyph.                                    |
| `color`    | The type's color, already resolved to a CSS color by the caller.                         |
| `summary`  | The one line stating what is decided for the reader — parent, tags, area, iteration.     |
| `onSubmit` | Creates the item. Resolving `false` keeps the box open with the typed title still in it. |
| `onCancel` | Abandons the row.                                                                        |

## Behaviour

- **Inline, not a dialog.** The answer being typed _is_ a row in the list underneath, so it lines up
  with the items already there and the reader can see what they are adding to and where it lands.
- **One question only.** Everything except the title is stated, never asked: those values are what
  make the new item belong where it is being added, and leaving them editable would only invite
  creating something the surface cannot show. The wording of that sentence is the **caller's**, since
  what is decided for the reader is a fact about the surface rather than about this row.
- **The caret starts in the box**, so the command that opened the row is the whole interaction.
- Titles are capped at Azure DevOps' own 255-character `System.Title` limit, so an over-long one is
  refused here instead of by the server.

Rendered elements carry `awesomeado-new-item` and `awesomeado-new-item__summary`; the editor itself
is the shared [`TextEditor`](../TextEditor/README.md).
