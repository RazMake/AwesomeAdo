# ToggleButton Control

A header on/off switch for enhanced views: a button that stays pressed and fills with the theme's
communication color while on, so a narrowed or switched board is never mistaken for the default one.
It is sized to the header's filters and pickers so they share one line height.

## Usage

```typescript
import { renderToggleButton } from "path/to/ToggleButton";

const toggle = renderToggleButton(document, {
  className: "awesomeado-resolved-filter",
  label: "Show only Done",
  pressed: false,
  pressedTitle: "Show all items",
  releasedTitle: "Show only Done items",
  onToggle: (pressed) => applyFilter(pressed),
});
```

## Public API

### `ToggleButtonOptions`

- **`className: string`** — The class the owning view finds the button by.
- **`label: string`** — The visible text; it stays the same in both states.
- **`pressed: boolean`** — The initial state.
- **`pressedTitle` / `releasedTitle: string`** — The tooltip and accessible name in each state,
  phrased as what pressing the button next would do.
- **`onToggle(pressed: boolean): void`** — Called after every press with the new state.

### `renderToggleButton(doc, options): HTMLButtonElement`

Renders the button with `aria-pressed` kept in step with its state. The button repaints itself on a
press; the owner only reacts to `onToggle`.
