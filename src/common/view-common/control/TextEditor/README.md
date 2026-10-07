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
  mentions: { userDirectory: services.userDirectory, logger: services.logger },
  images: { uploader: services.attachmentUploader, logger: services.logger },
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
| `maxLength`   | Characters the field accepts; omitted leaves it unbounded.                                                   |
| `rows`        | Lines the multi-line box opens at (default 3). Ignored for a one-line field.                                 |
| `placeholder` | Hint text; omitted uses the hint matching the shape.                                                         |
| `mentions`    | `{ userDirectory, logger, mentionNames? }` enables typed `@` identity suggestions in a multi-line field.     |
| `images`      | `{ uploader, logger }` stores pasted images in Azure DevOps and embeds them, in a multi-line field.          |
| `allowEmpty`  | Whether submitting nothing is meaningful. Default `false` (the empty field is inert); `true` lets it clear.  |
| `onSubmit`    | `(text) => Promise<boolean>` — resolve `true` to close, `false` to keep the editor open with the text in it. |
| `onCancel`    | Abandon the edit and put the surface back as it was.                                                         |

`createEditorButton(doc, label, primary)` builds the same compact themed button for other menu
panels, so their Set/Cancel pair matches the editor's.

## Behaviour

- **Keyboard.** `Esc` cancels. `Ctrl`/`Cmd`+`Enter` saves a multi-line box; a **bare `Enter`** saves a
  one-line field, where there is no newline to insert. Every keystroke is stopped from reaching ADO's
  own page shortcuts underneath the view.
- **Markdown.** `Ctrl`/`Cmd`+`B` wraps the selection in `**`; with no selection it inserts `****`
  with the caret between them. `Ctrl`/`Cmd`+`I` does the same with `_`. Pasting one HTTP(S) URL
  inserts `[](url)` and leaves the caret in the empty label.
- **Pasted images.** In an image-enabled field, pasting a picture (a screenshot, a copied image
  file) uploads it as an Azure DevOps work item attachment and embeds it as `![name](url)` — what
  ADO's own editor stores. A `![Uploading image N…]()` placeholder marks the spot while the upload
  runs, so the author can keep typing; the finished link replaces exactly that placeholder. Deleting
  the placeholder abandons that image. A failed upload removes its placeholder and says
  _"Image not uploaded: …"_ under the box. A clipboard that also carries text (an Office copy) pastes
  the text, as before. **Save** and `Ctrl`/`Cmd`+`Enter` wait until every upload has finished.
- **Abandoned images are cleaned up.** Because an image is stored the moment it is pasted, an edit
  that ends without saving removes its images from Azure DevOps again (best effort): **Cancel**,
  `Esc`, or the editor simply leaving the page (a dismissed menu, a collapsed list, a navigation).
  A save that resolves `true` keeps them, even though it typically unmounts the editor first; one
  that resolves `false` keeps them only while the editor stays to be saved again. An image whose
  placeholder was deleted before it landed is removed at once. Only a failed clean-up is logged.
- **Mentions.** In a mention-enabled field, `@` after the start of the field, a space, `.`, `/`, `\`,
  or Tab opens an identity list with no second search box. The text after `@` is the query; Up/Down
  changes the highlighted person and Enter inserts them. The list opens
  against the `@` itself — under the line being typed, not under the bottom of a box that may be
  many lines tall. A mention always reads as the **person** — `@Ada Lovelace`, in the same purple it
  wears once rendered — never as the `@<guid>` Azure DevOps stores. That holds for the mentions
  already in the text the editor opened on (pass `mentions.mentionNames` to name them) as much as for
  one just picked, and `onSubmit` receives the reference form back, so editing a note cannot destroy
  a mention in it. A name nobody could resolve is left exactly as stored rather than dropped.
- **Why the mention is highlighted rather than recoloured.** A `<textarea>` lays out and paints its
  own text, so the colour is drawn on a layer **behind** it: the field keeps its own glyphs, its
  caret and its selection, and the layer only washes the mention's background. Painting the letters
  themselves would mean hiding the field's text and making every character depend on the layer
  landing exactly right — and an editor is built **detached**, where every measurement reads 0.
  Nothing here measures anything: the layer is stretched with `inset` and shares one literal set of
  text metrics (`FIELD_TEXT_STYLE`) with the field, so it cannot drift.
- **While saving** both buttons are disabled. A write that resolves `false` re-enables them and shows
  _"Not saved — see the diagnostics log."_, leaving the author's words untouched.
- **Mandatory values advertise their state.** Unless `allowEmpty` is true, the confirm button stays
  disabled while the field contains only whitespace and enables as soon as text is entered.
- **Focus** is taken on the next tick, after the element is in the document.
- The caller owns the editor's lifetime: `onSubmit` resolving `true` is the signal to unmount it.

## The field on its own — `renderMarkdownField(doc, options)`

Not every authored value is edited in place. A creation form asks for a description alongside half a
dozen other answers and commits them all with **its own** button, so it needs the field without the
Save/Cancel pair. `renderMarkdownField` is exactly that field — the same box, the same Markdown
shortcuts, the same pasted-link handling and the same `@` mentions — and `renderTextEditor` is built
on it, so the two can never drift apart.

```typescript
const description = renderMarkdownField(document, {
  initialText: "",
  rows: 4,
  placeholder: "What has to be done? Markdown supported.",
  mentions: { userDirectory: services.userDirectory, logger: services.logger },
  onInput: () => refreshCreateButton(),
});

row.append(description.element);
// …later, when the form is submitted:
create({ description: description.storedText() });
```

`element` is the shell to mount (the box plus its mention layers and, with `images`, the upload
status line beneath it), `input` is the box itself — for focus and for the owner's own key handling —
and `storedText()` returns the text **as ADO must store it**, with each shown name back in its
`@<id>` reference form. `onInput` fires after every keystroke and after each pasted image lands, so
an owner can re-evaluate what the text now allows. `uploadingImages()` is `true` while a pasted image
is still on its way; an owner with its own commit button must hold it until this is `false`.

An owner with its own commit and cancel buttons also owns the image clean-up decision:
`trackSave(promise)` hands it the save (a `true` result keeps the images pasted so far), and
`discardImages()` removes them when the author cancels. Without a `trackSave`, the field leaving the
page is taken as an abandoned edit. Both are no-ops on a field without `images`.

A key the field consumes (picking a mention, applying a Markdown shortcut) is stopped before any
listener the owner added afterwards can see it, so a form's own Enter or Escape handling never fires
on the keystroke that picked a name.
