# TextEditor Control

The themed in-place text editor shared by every edit an enhanced view offers: adding a note,
correcting one, renaming an item, rewriting its description. One field, a **Save**/**Add** button, a
**Cancel** button, and one place a rejected write is reported.

## Usage

```typescript
import { renderTextEditor } from "path/to/TextEditor";

// A one-line rename:
const rename = renderTextEditor(document, {
  initialText: item.title,
  submitLabel: "Save",
  singleLine: true,
  maxLength: 255,
  onSubmit: (text) => persistTitle(text), // resolves true to close, false to keep open
  onCancel: () => closeSurface(),
});

// A multi-line Markdown box:
const describe = renderTextEditor(document, {
  initialText: item.description,
  submitLabel: "Save",
  allowEmpty: true,
  onSubmit: (text) => persistDescription(text),
  onCancel: () => closeSurface(),
});
```

## Public API

### `renderTextEditor(doc, options): HTMLElement`

| Option        | Meaning                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `initialText` | The text the editor opens on — empty for a new value, the existing **source** for a correction.              |
| `submitLabel` | The confirm button's label (`"Add"` / `"Save"`).                                                             |
| `singleLine`  | Renders a one-line `<input>` instead of the multi-line Markdown `<textarea>`. Defaults to multi-line.        |
| `maxLength`   | Characters the field accepts; omitted leaves it unbounded.                                                   |     | `rows` | How many lines the multi-line box opens at (default 3). Ignored for a one-line field. |     | `placeholder` | Hint text; omitted uses the hint matching the shape. |
| `allowEmpty`  | Whether submitting nothing is meaningful. Default `false` (the empty field is inert); `true` lets it clear.  |
| `onSubmit`    | `(text) => Promise<boolean>` — resolve `true` to close, `false` to keep the editor open with the text in it. |
| `onCancel`    | Abandon the edit and put the surface back as it was.                                                         |

## Behaviour

- **Keyboard.** `Esc` cancels. `Ctrl`/`Cmd`+`Enter` saves a multi-line box; a **bare `Enter`** saves a
  one-line field, where there is no newline to insert. Every keystroke is stopped from reaching ADO's
  own page shortcuts underneath the view.
- **While saving** both buttons are disabled. A write that resolves `false` re-enables them and shows
  _"Not saved — see the diagnostics log."_, leaving the author's words untouched.
- **Focus** is taken on the next tick, after the element is in the document.
- The caller owns the editor's lifetime: `onSubmit` resolving `true` is the signal to unmount it.
