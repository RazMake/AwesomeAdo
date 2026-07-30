# StatusBadge

A theme-aware work-item status control showing the current **Status** — the application state
(board-column label), not the raw ADO State — colored by its position in the team's global
board-column order so the same position reads identically for every work-item type.

## Usage

```typescript
import { renderStatusBadge, type StatusBadgeOptions } from "path/to/StatusBadge";

const badge = renderStatusBadge(document, {
  state: "In Progress",
  ordinal: 1,
  editable: true,
  columns: [
    { column: "New", primaryState: "New", ordinal: 0 },
    { column: "In Progress", primaryState: "Active", ordinal: 1 },
    { column: "Resolved", primaryState: "Resolved", ordinal: 3 },
  ],
  onChange: (primaryState, column) => {
    console.log("State changed to:", primaryState, "via column:", column);
  },
});
```

## Public API

### `StatusColumnOption`

A selectable board-column choice in the status dropdown.

- **`column: string`** — The board-column label shown to the user (the application state).
- **`primaryState: string`** — The ADO state written back when this column is chosen (the column's primary state = `states[0]`).
- **`ordinal: number`** — Zero-based position of this column in the team's global board-column order; drives its color. Use a negative value when the column is not part of the configured board order.

### `StatusBadgeOptions`

Configuration for rendering the status badge.

- **`state: string`** — The current Status label to display: the application state (board-column label), not the raw ADO State. The caller resolves the item's ADO State to its column before passing it here.
- **`ordinal?: number`** — Zero-based global board-column position of the current state, driving its color. Omit or use a negative value for a neutral tint.
- **`columns?: StatusColumnOption[]`** — The selectable columns when editable; empty/undefined => the badge is effectively read-only.
- **`editable?: boolean`** — When `true` (and `columns` non-empty), the badge is editable: hand cursor + opens a dropdown on click.
- **`onChange?: (primaryState: string, column: string) => void`** — Called with the chosen primary ADO state and its column label when the user picks one. Fires immediately (persist-on-select).

### `renderStatusBadge(doc: Document, options: StatusBadgeOptions): HTMLElement`

Renders a status badge showing the current state with a position-specific tint.

- **Read-only mode** (`editable: false` OR no `columns`): `cursor:default`; clicking does nothing; no dropdown.
- **Editable mode** (`editable: true` AND `columns` non-empty): `cursor:pointer` with a caret affordance (▾). Clicking opens a themed dropdown of clickable colored badges for every alternative column; the current state is omitted. Selecting a badge calls `onChange(primaryState, column)` immediately and closes the popup.
- The dropdown closes on outside `pointerdown` (capture), Escape, and on selection.

## Features

- **Position-consistent color:** Color is keyed off the state's global board-column ordinal — 1st gray, 2nd blue, 3rd yellow, 4th green, 5th red — so the same board column reads identically for every work-item type. Positions beyond the fifth reuse the terminal (red) color. Each dropdown row is colored by its own column's ordinal.
- **Contrasting terminal text:** The first three positions carry the theme's primary text; the 4th
  (green) and 5th (red) positions use dedicated same-hue foreground roles so a "done" or "removed"
  state stands out. Each ordinal's background and stronger border are separate theme roles.
- **Neutral fallback:** An unknown ordinal (omitted or negative — e.g. a raw ADO State mapping to no
  board column) uses `--control-background-subtle`, `--text-primary-color`, and `--control-border`.
- **Theme-aware:** The popup and every ordinal color read the complete variable set pinned by the
  resolved AwesomeADO theme.
- **HTML injection safety:** State and column labels are inserted as `textContent`, not `innerHTML`.
