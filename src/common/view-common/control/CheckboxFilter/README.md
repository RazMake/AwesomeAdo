# `CheckboxFilter`

The compact **multi-select filter** every view narrows a list with: a button-sized trigger that opens
a themed popup of checkboxes, with an optional quick-search box for long lists and an optional
"combining" mode that turns the ticked values into a real condition.

The control knows nothing about what a value _means_ — it exchanges opaque strings — so area paths,
tags, and anything else a view filters by share one affordance, and their trigger, popup, dismissal,
and empty-list behaviour cannot drift apart.

## Public API

- `renderCheckboxFilter(doc, options): CheckboxFilterHandle`
- `CheckboxFilterOption` — `{ value, label?, title? }`. `value` is what the caller filters by and is
  always exchanged in full; `label` is display-only (use it for a shortened form) and `title` is the
  row's tooltip.
- `CheckboxFilterSelection` — `{ included, excluded, matchAll }`. The three parts are AND-ed: every
  excluded value must be absent, and the included ones must be present either all together
  (`matchAll`) or one at a time.
- `CheckboxFilterOptions`:
  - `label` — the noun on the trigger and the popup heading (`Area`, `Tags`).
  - `fixedTitle` — a tooltip used whatever is selected. For a button wearing a view's shorthand
    (`Lanes`) rather than the name of the field it narrows: the tooltip is the one place that can
    say which field that is, so it should not turn into a condition summary once something is
    picked. Without it the tooltip follows the condition.
  - `options` — the values offered, in list order.
  - `selected` / `excluded` — values required or excluded initially; anything not in `options` is
    ignored, and a value seeded as both resolves to required.
  - `matchAll` — start the required values AND-ed rather than OR-ed.
  - `combining` — adds the per-row **not** toggle and the `Any`/`All` switch. Off by default, so
    `excluded` and `matchAll` are ignored unless it is set.
  - `clearOnTriggerWhenActive` — makes the trigger clear the condition rather than open the popup
    while anything is chosen, and drops the popup's own **Clear**. Off by default: it costs the
    reader the ability to adjust a live condition without rebuilding it.
  - `classPrefix` — the class-name stem for this instance (`awesomeado-tag-filter`), so a view's
    selectors can tell one filter from another.
  - `searchPlaceholder` — omit for a short list; supplying it adds the quick-search box.
  - `onChange(selection)` / `onPopupClosed()`.
- `CheckboxFilterHandle` — `{ element, selection(), setSelectedValues(values) }`.
  `setSelectedValues` replaces the required values and closes the popup **without** firing
  `onChange`, so a caller re-seeding the control does not re-enter its own change handler.

## Usage

```typescript
const filter = renderCheckboxFilter(doc, {
  label: "Tags",
  classPrefix: "awesomeado-tag-filter",
  options: tags.map((tag) => ({ value: tag })),
  selected: session.requiredTags,
  excluded: session.excludedTags,
  matchAll: session.matchAllTags,
  combining: true,
  searchPlaceholder: "Search tags",
  onChange: (selection) => {
    session.requiredTags = selection.included;
    session.excludedTags = selection.excluded;
    session.matchAllTags = selection.matchAll;
    repaint();
  },
});
header.append(filter.element);
```

## Behaviour

- The trigger carries a count badge covering **both** directions, lights (and tints the button) once
  anything is chosen, and is disabled when there is nothing to choose from. Its **accessible name**
  spells the condition out (`Tags: all of api, docs; none of legacy`) rather than counting it,
  because a count cannot tell a required value from an excluded one, and reads `Filter by <label>`
  with nothing chosen. The **tooltip** matches it unless `fixedTitle` pins it.
- Required and excluded are mutually exclusive on one row: setting either clears the other.
- The `Any`/`All` switch is a mode, not a selection — **Clear** empties both directions, reports it,
  closes the popup, and leaves the mode alone.
- The popup is built on each open, dismisses on Escape, an outside pointer, or the trigger, and stays
  open while several checkboxes are ticked.
- With `clearOnTriggerWhenActive`, pressing the trigger while the condition names anything empties it
  (reporting the change) instead of opening the popup; pressing it again opens the popup as usual.
  The popup then carries **no Clear** — one gesture owns clearing, so the heading does not offer a
  second.
- The quick-search matches the visible label _and_ the underlying value, so a reader who knows the
  full value can still type it when the label was shortened.
