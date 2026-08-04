# `CheckboxFilter`

The compact **multi-select filter** every view narrows a list with: a button-sized trigger that opens
a themed popup of checkboxes, with an optional quick-search box for long lists.

The control knows nothing about what a value _means_ — it exchanges opaque strings — so area paths,
tags, and anything else a view filters by share one affordance, and their trigger, popup, dismissal,
and empty-list behaviour cannot drift apart.

## Public API

- `renderCheckboxFilter(doc, options): CheckboxFilterHandle`
- `CheckboxFilterOption` — `{ value, label?, title? }`. `value` is what the caller filters by and is
  always exchanged in full; `label` is display-only (use it for a shortened form) and `title` is the
  row's tooltip.
- `CheckboxFilterOptions`:
  - `label` — the noun on the trigger and the popup heading (`Area`, `Tags`).
  - `options` — the values offered, in list order.
  - `selected` — values selected initially; anything not in `options` is ignored.
  - `classPrefix` — the class-name stem for this instance (`awesomeado-tag-filter`), so a view's
    selectors can tell one filter from another.
  - `searchPlaceholder` — omit for a short list; supplying it adds the quick-search box.
  - `onChange(selected)` / `onPopupClosed()`.
- `CheckboxFilterHandle` — `{ element, selectedValues(), setSelectedValues(values) }`.
  `setSelectedValues` replaces the selection and closes the popup **without** firing `onChange`, so
  a caller re-seeding the control does not re-enter its own change handler.

## Usage

```typescript
const filter = renderCheckboxFilter(doc, {
  label: "Tags",
  classPrefix: "awesomeado-tag-filter",
  options: tags.map((tag) => ({ value: tag })),
  selected: session.tags,
  searchPlaceholder: "Search tags",
  onChange: (selected) => {
    session.tags = selected;
    repaint();
  },
});
header.append(filter.element);
```

## Behaviour

- The trigger carries a count badge that lights (and tints the button) once anything is selected, and
  is disabled when there is nothing to choose from.
- The popup is built on each open, dismisses on Escape, an outside pointer, or the trigger, and stays
  open while several checkboxes are ticked.
- **Clear** empties the selection, reports it, and closes the popup.
- The quick-search matches the visible label _and_ the underlying value, so a reader who knows the
  full value can still type it when the label was shortened.
