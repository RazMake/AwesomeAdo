# ItemTypeIcon

The Azure DevOps work item type icon (Epic, Feature, Story, Bug, …) shown in front of an item's
title.

The icon is sized in `em`, so it always matches the title it precedes — including in nested tree
rows that render smaller than their parent. ADO serves the icon already tinted with the type's own
color, so the control varies **brightness and saturation**, not hue: every level is the same
recognizable icon.

## Emphasis

Emphasis is two **independent** axes, not one scale:

| `colored` | `loud`  | Looks like                | Reads as                       |
| --------- | ------- | ------------------------- | ------------------------------ |
| `false`   | `false` | drained of color, receded | "nothing here"                 |
| `false`   | `true`  | drained of color, full    | "nothing here, but it is open" |
| `true`    | `false` | the type's color, dimmed  | "there is something here"      |
| `true`    | `true`  | the type's color, full    | "you are looking at it"        |

The control does **not** know what either axis means — the caller decides. They are kept independent
because a caller needs all four: an item can be open while holding nothing, and no single quiet→loud
progression can say that without claiming there is something to see. A drained icon also recedes
further than a dimmed colored one, because two pulled-back states separated only by opacity are a
brightness judgement a reader has to make against a row they have nothing to compare to;
grey-vs-colored is visible in one pass down a column.

## Usage

```ts
import { renderItemTypeIcon } from "../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";

const icon = renderItemTypeIcon(doc, {
  iconUrl: type.icon,
  color: "#773b93",
  typeName: "Feature",
  emphasis: { colored: false, loud: false },
});

titleLine.prepend(icon.element);
icon.setEmphasis({ colored: hasNotes, loud: true }); // e.g. once the item's notes are expanded
```

## Options

| Option     | Type                   | Meaning                                                       |
| ---------- | ---------------------- | ------------------------------------------------------------- |
| `iconUrl`  | `string \| null`       | ADO's type icon URL; `null` renders the colored fallback dot. |
| `color`    | `string \| null`       | The type color (`#rrggbb`) the fallback dot is filled with.   |
| `typeName` | `string`               | The type name, used as the icon's tooltip.                    |
| `title`    | `string` (optional)    | Overrides the tooltip; `""` leaves the icon with none at all. |
| `emphasis` | `ItemTypeIconEmphasis` | How loudly the icon starts. Defaults to colored and loud.     |

Pass `title: ""` when the icon sits inside a control that carries its own tooltip. A `title` on the
icon **shadows** the one on its container, so the reader would hover the thing they are about to
click and be told the work item type instead of what clicking it does. It has to be absent rather
than empty: an empty `title` shadows the container's just as effectively.

Returns `{ element, setEmphasis }`.

If the icon URL fails to load, the colored dot replaces it — a reader never sees a broken-image
glyph.
