# ItemTypeIcon

The Azure DevOps work item type icon (Epic, Feature, Story, Bug, …) shown in front of an item's
title.

The icon is sized in `em`, so it always matches the title it precedes — including in nested tree
rows that render smaller than their parent. ADO serves the icon already tinted with the type's own
color, so the control varies **brightness and saturation**, not hue: every level is the same
recognizable icon.

## Emphasis

| Level   | Looks like               | Reads as                  |
| ------- | ------------------------ | ------------------------- |
| `quiet` | drained of color, dimmed | "nothing here"            |
| `muted` | the type's color, dimmed | "there is something here" |
| `full`  | the type's color, full   | "you are looking at it"   |

The control does **not** know what the levels mean — the caller decides. `quiet` desaturates rather
than simply dimming further, because two dim states separated only by opacity are a brightness
judgement a reader has to make against a row they have nothing to compare to; grey-vs-colored is
visible in one pass down a column.

## Usage

```ts
import { renderItemTypeIcon } from "../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";

const icon = renderItemTypeIcon(doc, {
  iconUrl: type.icon,
  color: "#773b93",
  typeName: "Feature",
  emphasis: "quiet",
});

titleLine.prepend(icon.element);
icon.setEmphasis("full"); // e.g. once the item's notes are expanded
```

## Options

| Option     | Type                   | Meaning                                                       |
| ---------- | ---------------------- | ------------------------------------------------------------- |
| `iconUrl`  | `string \| null`       | ADO's type icon URL; `null` renders the colored fallback dot. |
| `color`    | `string \| null`       | The type color (`#rrggbb`) the fallback dot is filled with.   |
| `typeName` | `string`               | The type name, used as the icon's tooltip.                    |
| `emphasis` | `ItemTypeIconEmphasis` | How loudly the icon starts. Defaults to `full`.               |

Returns `{ element, setEmphasis }`.

If the icon URL fails to load, the colored dot replaces it — a reader never sees a broken-image
glyph.
