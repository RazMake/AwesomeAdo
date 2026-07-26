# AssignedTo Control

A minimal, theme-aware user assignment control for Azure DevOps query views.

## Usage

```typescript
import { renderAssignedTo, type AssignedToOptions } from "path/to/AssignedTo";

const control = renderAssignedTo(document, {
  user: { displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
  userDirectory: myUserDirectory,
  suggestions: () => myProjectCrew,
  onChange: (selectedUser) => {
    // Write to Azure DevOps, then reflect what it accepted:
    void persist(selectedUser).then(() => control.setUser(selectedUser));
  },
});
```

## Public API

### `AssignedToOptions`

Configuration for rendering the control.

- **`user: TrackedUser | null`** — The currently assigned user; `null` means unassigned.
- **`userDirectory: IUserDirectory`** — The user directory used to search Azure DevOps for people
  who are not among the suggestions.
- **`suggestions?: () => TrackedUser[]`** — The people offered the moment the picker opens, before
  anything is typed — normally the project's Feature Crew. Called on every open, so a person
  assigned a moment ago is already on the list. Each may carry a `tag`, shown beside their name when
  `showTag` is on. Defaults to nobody.
- **`onChange?: (user: DirectoryUser) => void`** — Called when a new user is selected from the picker.
- **`showTag?: boolean`** — When `true`, render the assignee's Feature Crew tag as a colored
  [`TagPill`](../TagPill/README.md) after their name (the neutral "??" pill when they have no tag
  yet). Off by default; the tag is read from `user.tag`. The pill is hidden for an unassigned slot.
  This governs the **chip** only: the picker tags the people it offers whenever `suggestions` carry
  tags, so a deliberately tagless chip still gets a picker that shows which crew each candidate
  belongs to. Anyone the directory returns who is not on the project shows "??".
- **`assignableTags?: string[]`** — The tags already in use across the roster, offered as choices in
  the tag editor. Ignored unless `onTagChange` is also supplied.
- **`onTagChange?: (tag: string) => void`** — When supplied (together with `showTag`), the tag pill
  becomes interactive: clicking it opens an editor to move the assignee onto a different existing
  tag or to create a new one. Called with the chosen tag.

### `AssignedToHandle`

The returned element, extended with:

- **`setUser(user: TrackedUser | null): void`** — Show `user` as the current assignee (and their
  tag); `null` renders "Unassigned".

### `MAX_TAG_LENGTH`

The maximum length (15) allowed for a newly created tag.

### `renderAssignedTo(doc: Document, options: AssignedToOptions): AssignedToHandle`

Renders an assignee control as clickable text (no border or background) that opens a people-picker popup.

- Displays the user's `displayName` or "Unassigned" when no user is set.
- Clicking the name toggles a picker popup that lists `suggestions` straight away, with the caret
  already in its search box.
- Typing filters the suggestions locally; from two characters up it also calls
  `userDirectory.search(query)` and appends the organization-wide matches below them.
- A status line reports what is happening ("Searching Azure DevOps…", "No people found.", …), so an
  empty list is never ambiguous. While a directory round-trip is in flight it carries a **spinner**,
  because a still list plus one line of small text reads as "nobody matched" rather than "waiting".
- Selecting a result calls `onChange` and closes the popup — **without** repainting the name.
- An outside click or Escape closes the popup without changing the assignment.

### Keyboard

The picker behaves like a native dropdown: it opens focused on the search box, <kbd>↓</kbd>/<kbd>↑</kbd>
walk the list (wrapping at both ends) and <kbd>Enter</kbd> commits the highlighted person. The top
row is highlighted whenever the list is (re)painted, so <kbd>Enter</kbd> alone accepts the best
match. Hovering a row moves the same highlight, so the mouse and the keyboard never disagree about
what <kbd>Enter</kbd> would pick, and the highlight never leaves the search box — the query stays
editable while arrowing.

### Persist-then-reflect

Like [`StatusBadge`](../StatusBadge/README.md) and [`EtaBadge`](../EtaBadge/README.md), this control
never paints a pick on its own. The owner persists the change and calls `setUser` once Azure DevOps
accepts it, so a rejected write can never leave a name on screen that was never saved.

## Features

- **Name-only display:** Shows only the user's display name as clickable text, with no avatar or visual padding box.
- **Instant suggestions:** The people already on the project are offered with no network round-trip,
  which is the common case for a reassignment.
- **Theme-aware:** Uses Azure DevOps CSS custom properties (`--callout-background-color`, `--palette-neutral-20`, `--palette-neutral-4`) with fallbacks, so it adapts to light/dark themes.
- **Out-of-order response guard:** Ignores stale search results if a newer query has already been issued.
- **Never scrolls sideways:** The result list is `overflow-x: hidden` and each row's display name and
  directory address are clipped with an ellipsis on a single line. A directory address is one
  unbreakable token, so without this a single long address would widen every row and drag a
  horizontal scrollbar in under the list — forcing the user to scroll just to read who is next. The
  full value stays on each line's `title`, so truncating costs the reader nothing.
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
