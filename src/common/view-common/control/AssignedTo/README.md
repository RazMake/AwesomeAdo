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
- **`showTag?: boolean`** — When `true`, render the assignee's Feature Crew tag as a colored
  [`TagPill`](../TagPill/README.md) after their name (the neutral "??" pill when they have no tag
  yet). Off by default; the tag is read from `user.tag`. No pill is shown for an unassigned slot.
- **`assignableTags?: string[]`** — The tags already in use across the roster, offered as choices in
  the tag editor. Ignored unless `onTagChange` is also supplied.
- **`onTagChange?: (tag: string) => void`** — When supplied (together with `showTag`), the tag pill
  becomes interactive: clicking it opens an editor to move the assignee onto a different existing
  tag or to create a new one. Called with the chosen tag.

### `MAX_TAG_LENGTH`

The maximum length (15) allowed for a newly created tag.

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

## Tag editing

When `showTag` and `onTagChange` are both set, the tag pill is a trigger that opens a small editor:

- **Pick an existing tag:** the tags in `assignableTags` are listed as pills; clicking one moves the
  assignee onto that tag and closes the editor.
- **Add a new tag:** an input (max 15 characters, spaces stripped as typed) plus an **Add** button.
  The button stays disabled for an empty value or a case-insensitive duplicate of an existing tag,
  so no orphan or duplicate tags can be created. `Enter` commits the same as clicking **Add**.
- Selecting or adding a tag immediately assigns it to the current person, so a new tag is always in
  use the moment it exists.
