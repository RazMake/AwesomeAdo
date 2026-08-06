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
- **`name: string`** — The sprint display name. This is the value the picker reports back on selection and in its callbacks.
- **`label?: string`** — Optional display text shown in the dropdown (e.g. `Current - Sprint 5`); defaults to `name`. Purely cosmetic — selection and callbacks still carry the raw `name`, so filtering by sprint name keeps working.
- **`relation?: "past" | "current" | "future"`** — Optional position relative to the current sprint. Purely cosmetic: past options use `var(--sprint-past-foreground)`, future options use `var(--communication-foreground)`, and the current option renders bold in an explicit neutral color. The selected option's relation is mirrored onto the closed `<select>`, while current remains neutral even when the native list opens from a past/future selection. The value is mirrored onto the option's and select's `data-relation` attributes. Omit it for an unstyled option.

### `SprintPickerOptions`

Configuration for rendering the sprint picker.

- **`sprints: SprintOption[]`** — The team's sprints, in display order.
- **`selectedName?: string | null`** — The sprint name to select initially (default = the current sprint the caller computed); falls back to the first sprint if missing or not found.
- **`showFilterButton?: boolean`** — Whether to render the filter toggle. Defaults to `true`; when `false`, filtering stays active and the dropdown remains enabled.
- **`filterActive?: boolean`** — Whether the filter starts active. Default `false`.
- **`onFilterToggle?: (active: boolean, selectedName: string | null) => void`** — Called when the filter toggle flips; carries the new active state and the currently selected sprint name (or `null` if no sprints).
- **`onSprintChange?: (selectedName: string) => void`** — Called when the selected sprint changes.

### `SprintPickerHandle`

A handle for controlling and querying the sprint picker state.

- **`element: HTMLElement`** — The root element to mount in the DOM.
- **`isFilterActive(): boolean`** — Whether the filter is currently active.
- **`selectedSprint(): string | null`** — The currently selected sprint name, or `null` when there are no sprints.

### `renderSprintPicker(doc: Document, options: SprintPickerOptions): SprintPickerHandle`

Renders a sprint dropdown with an optional **icon filter toggle button** in front.

- The **filter button** uses an inline SVG funnel icon (NOT text), is theme-styled, and reflects its active state via `aria-pressed` and a subtle themed "on" look (`var(--palette-neutral-8, …)` background when active, `transparent` when inactive).
- The **dropdown** is a native `<select>` element populated with one `<option>` per sprint, theme-styled. It is **disabled while the filter is inactive** (picking a sprint has no effect until the funnel is toggled on) and becomes enabled once the filter is active.
- Clicking the button toggles the filter active state, enables/disables the dropdown to match, and calls `onFilterToggle(active, selectedSprint())`.
- With `showFilterButton: false`, the button is omitted, `isFilterActive()` stays `true`, and the dropdown remains enabled whenever sprint options exist.
- Changing the select calls `onSprintChange(selectedName)`.
- When `sprints` is empty, both the button and select are disabled, and `selectedSprint()` returns `null`.

## Features

- **Icon toggle button:** The filter button shows an SVG funnel icon (inherits `currentColor` so it follows the theme), NOT a text label. It has `aria-label="Filter by sprint"` and a `title` for accessibility.
- **Active state signaling:** The button uses `aria-pressed` to reflect its active state (`"true"` or `"false"`). When active, the button uses the theme's communication background and on-communication foreground; when inactive, the background is `transparent`.
- **Filter-gated dropdown:** The dropdown is disabled while the filter is inactive and enabled once the filter is toggled on, so choosing a sprint only becomes possible when it actually filters.
- **Theme-aware:** Both the button and select use roles from the complete palette pinned by the resolved AwesomeADO theme.
- **Time-direction styling:** Options carrying a `relation` are tinted by where their sprint sits in time — past amber, future in the theme accent, current bold and explicitly neutral. The closed `<select>` preserves the selected option's relation styling.
- **Empty sprints handling:** When `sprints` is empty, both controls are disabled, and `selectedSprint()` returns `null`.

## `SprintSelectField.ts`

### `renderSprintSelectField(doc, options): SelectFieldHandle`

The sprint asked for by a **form** rather than filtered by a board: the shared
[`SelectField`](../SelectField/README.md) populated from the team's sprint window and opened on the
current sprint. Used by the All Projects Catalog View's "add a project" row and its "Add work item"
form, so one answer cannot read two ways across the same surface.

- **`classPrefix`** — the class-name stem this instance's elements are marked with.
- **`fallbackPath`** — the iteration shown until the window lands and whenever the team has no sprints
  at all; usually where the item would go anyway (the parent's iteration, or the project's own root).
  An empty string reads as `(the project's default)`.
- **`loadSprintWindow()`** — reads the window. Called once, when the field is built: a form that asks
  for a sprint is opened rarely and closed again, so nothing around it would keep the answer warm.

The field is inert until that read settles, then re-enabled **either way**, so it never reads as
still loading. Options carry the same past/current/future styling the picker above uses.
