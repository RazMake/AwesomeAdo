# Area Path Selection

`renderRetainedAreaPathFilter(doc, { areaPaths, selection, onChange })` is the header area-path
filter Project Tracking and the Consumers View share, so both look and behave identically.

- `areaPaths` — the full paths the board can offer right now.
- `selection` — the board's retained `Set` of selected full paths. Paths the board no longer offers
  are dropped before rendering, and the set is updated in place as the reader picks.
- `onChange(selected)` — called after the selection changed; log the decision and repaint here.

Once a selection is active, pressing the lit-up trigger clears it in one press, like every other
header filter.
