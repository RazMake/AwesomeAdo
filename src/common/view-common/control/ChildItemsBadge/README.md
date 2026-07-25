# ChildItemsBadge Control

A muted-yellow "completed / total" badge for an item's direct children, with a click-through popup
listing each child.

## Usage

```typescript
import { renderChildItemsBadge, type ChildItemDescriptor } from "path/to/ChildItemsBadge";

const badge = renderChildItemsBadge(document, {
  completedCount: 2,
  userDirectory: myUserDirectory,
  children: [
    {
      assignedTo: { displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
      title: "Wire up the loader",
      titleColor: "#0078D4",
      iconUrl: "https://.../story.png",
      url: "https://dev.azure.com/org/project/_workitems/edit/42",
      onAssigneeChange: (user) => console.log("reassigned to", user.displayName),
    },
    // …two more children (total 3), of which 2 are completed → badge shows "2 / 3"
  ],
});
```

## Public API

### `ChildItemsBadgeOptions`

- **`children: ChildItemDescriptor[]`** — The direct children summarized by the badge and listed in
  its popup. `children.length` is the denominator of "completed / total".
- **`completedCount: number`** — How many children are completed (the numerator). Completion is a
  board-column decision the **caller** owns, so it is passed in rather than derived here.
- **`userDirectory: IUserDirectory`** — Forwarded to each child row's assignee picker.

### `ChildItemDescriptor`

- **`assignedTo: TrackedUser | null`** — The child's assignee; `null` means unassigned.
- **`title: string`** — The child's title.
- **`titleColor: string | null`** — The child's type color (hex, **with** a leading `#`); `null`
  uses the theme's primary text color.
- **`iconUrl: string | null`** — The child's type icon URL, shown as the open affordance; `null`
  falls back to an `↗` glyph.
- **`url: string | null`** — The ADO web URL that opens the item; `null` renders the affordance inert.
- **`onAssigneeChange?: (user: DirectoryUser) => void`** — Called when this child's assignee is
  changed from its picker.

### `renderChildItemsBadge(doc, options): HTMLElement`

Renders the badge as `completed / total` (e.g. `2 / 3`) in a very muted yellow. Clicking it toggles a
popup with one row per child:

`{AssignedTo picker} {title in its type color} {type icon → opens the item in ADO}`

## Features

- **Reuses the shared `AssignedTo` control** so a child's assignee behaves exactly like the main
  tree's assignee (same picker, same search, same theming).
- **Type-colored titles** via the caller-supplied `titleColor`, inserted as `textContent` (no HTML
  injection).
- **Open in Azure DevOps** through a `target="_blank"`, `rel="noopener noreferrer"` link so the
  opened tab cannot reach back into the extension's page context.
- **Dismissal parity with `StatusBadge`:** the popup closes on an outside click, a second badge
  click, or Escape.
- **Theme-aware:** uses ADO CSS custom properties (`--callout-background-color`,
  `--palette-neutral-20`, `--text-primary-color`) with fallbacks.
