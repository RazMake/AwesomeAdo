# SprintPicker

A theme-aware sprint filter control combining an icon filter toggle button and a sprint dropdown.

## Usage

```typescript
import { renderSprintPicker, type SprintPickerOptions } from "path/to/SprintPicker";

const handle = renderSprintPicker(document, {
  sprints: [
    { path: "Team\\Sprint 1", name: "Sprint 1" },
    { path: "Team\\Sprint 2", name: "Sprint 2" },
    { path: "Team\\Sprint 3", name: "Sprint 3" },
  ],
  selectedName: "Sprint 2",
  filterActive: false,
  onFilterToggle: (active, selectedName) => {
    console.log("Filter is now:", active ? "active" : "inactive", "Sprint:", selectedName);
  },
  onSprintChange: (selectedName) => {
    console.log("Sprint changed to:", selectedName);
  },
});

container.appendChild(handle.element);
```

## Public API

### `SprintOption`

A sprint choice in the dropdown.

- **`path: string`** — The iteration path (stable id).
- **`name: string`** — The sprint display name.

### `SprintPickerOptions`

Configuration for rendering the sprint picker.

- **`sprints: SprintOption[]`** — The team's sprints, in display order.
- **`selectedName?: string | null`** — The sprint name to select initially (default = the current sprint the caller computed); falls back to the first sprint if missing or not found.
- **`filterActive?: boolean`** — Whether the filter starts active. Default `false`.
- **`onFilterToggle?: (active: boolean, selectedName: string | null) => void`** — Called when the filter toggle flips; carries the new active state and the currently selected sprint name (or `null` if no sprints).
- **`onSprintChange?: (selectedName: string) => void`** — Called when the selected sprint changes.

### `SprintPickerHandle`

A handle for controlling and querying the sprint picker state.

- **`element: HTMLElement`** — The root element to mount in the DOM.
- **`isFilterActive(): boolean`** — Whether the filter is currently active.
- **`selectedSprint(): string | null`** — The currently selected sprint name, or `null` when there are no sprints.

### `renderSprintPicker(doc: Document, options: SprintPickerOptions): SprintPickerHandle`

Renders a sprint filter control = an **icon filter toggle button** (in front) + a **sprint dropdown**.

- The **filter button** uses an inline SVG funnel icon (NOT text), is theme-styled, and reflects its active state via `aria-pressed` and a subtle themed "on" look (`var(--palette-neutral-8, …)` background when active, `transparent` when inactive).
- The **dropdown** is a native `<select>` element populated with one `<option>` per sprint, theme-styled.
- Clicking the button toggles the filter active state and calls `onFilterToggle(active, selectedSprint())`.
- Changing the select calls `onSprintChange(selectedName)`.
- When `sprints` is empty, both the button and select are disabled, and `selectedSprint()` returns `null`.

## Features

- **Icon toggle button:** The filter button shows an SVG funnel icon (inherits `currentColor` so it follows the theme), NOT a text label. It has `aria-label="Filter by sprint"` and a `title` for accessibility.
- **Active state signaling:** The button uses `aria-pressed` to reflect its active state (`"true"` or `"false"`). When active, the button shows a subtle themed background (`var(--palette-neutral-8, rgba(128,128,128,0.12))`); when inactive, the background is `transparent`.
- **Theme-aware:** Both the button and select use ADO CSS custom properties (`--background-color`, `--text-primary-color`, `--palette-neutral-20`, `--palette-neutral-8`) with fallbacks, so they adapt to light/dark themes.
- **Empty sprints handling:** When `sprints` is empty, both controls are disabled, and `selectedSprint()` returns `null`.
