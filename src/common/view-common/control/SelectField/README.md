# SelectField Control

A theme-aware single-select field: one value picked from a list the extension draws itself.

Use it wherever a form asks the reader to choose exactly one value. A native `<select>` is not an
option on these surfaces — its collapsed box takes the theme's colors, but the **open list** is
painted by the platform, so on a dark board the choices appear in a white system list. The part the
reader looks at while choosing is the part that cannot be themed, so the list is built here out of
the same tokens every other popup uses.

Values are exchanged whole; labels are display-only. A shortened or abbreviated label can therefore
never become the value written back to Azure DevOps.

## Usage

```typescript
const area = renderSelectField(document, {
  classPrefix: "awesomeado-new-work-item__area",
  label: "Area path",
  choices: paths.map((path) => ({ value: path, label: shortLabel(path), title: path })),
  selected: parent.areaPath,
  onChange: (path) => remember(path),
});

row.append(area.element);
```

`value()` reads the current value (the empty string when nothing is offered).
`setChoices(choices, selected)` replaces the list — closing an open popup first, so a reader can
never pick a value the field has stopped offering — and keeps `selected` when it is still on offer,
otherwise falling back to the first choice. `setDisabled(disabled)` makes the field inert, which is
what a field whose values are still being read should be until they land.

Each choice may carry a `title` (the full value behind a shortened label) and `declarations` —
style longhands the row and the collapsed field both wear, which is how a sprint's past/current/
future emphasis reads the same here as in the [SprintPicker](../SprintPicker/README.md).

`classPrefix` is the class-name stem for every element of one instance (`…__trigger`, `…__value`,
`…__popup`, `…__option`), so a caller's selectors cannot match a different field on the same
surface.

Dismissal is the shared [`popupHost`](../popupHost/README.md) contract: clicking the trigger again,
clicking outside, or pressing Escape closes the list, and the host keeps it inside the visible area.
