# AssignedTo Control

A minimal, theme-aware user assignment control for Azure DevOps query views.

## Usage

```typescript
import { renderAssignedTo, type AssignedToOptions } from "path/to/AssignedTo";

const control = renderAssignedTo(document, {
  user: { displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
  userDirectory: myUserDirectory,
  onChange: (selectedUser) => {
    console.log("User changed to:", selectedUser);
  },
});
```

## Public API

### `AssignedToOptions`

Configuration for rendering the control.

- **`user: TrackedUser | null`** — The currently assigned user; `null` means unassigned.
- **`userDirectory: IUserDirectory`** — The user directory for searching and resolving users.
- **`onChange?: (user: DirectoryUser) => void`** — Called when a new user is selected from the picker.

### `renderAssignedTo(doc: Document, options: AssignedToOptions): HTMLElement`

Renders an assignee control as clickable text (no border or background) that opens a people-picker popup.

- Displays the user's `displayName` or "Unassigned" when no user is set.
- Clicking the name toggles a search popup with an input field.
- Typing in the search triggers `userDirectory.search(query)` and displays results.
- Selecting a result calls `onChange` and closes the popup.
- Pressing Escape closes the popup without changing the assignment.

## Features

- **Name-only display:** Shows only the user's display name as clickable text, with no avatar or visual padding box.
- **Theme-aware:** Uses Azure DevOps CSS custom properties (`--callout-background-color`, `--palette-neutral-20`, `--palette-neutral-4`) with fallbacks, so it adapts to light/dark themes.
- **Out-of-order response guard:** Ignores stale search results if a newer query has already been issued.
- **HTML injection safety:** Result names are inserted as `textContent`, not `innerHTML`.
