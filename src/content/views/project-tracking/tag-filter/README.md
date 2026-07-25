# Tag Filter Panel

The Project Tracking view's top-of-board panel of clickable **tag pills**. It filters the tree to
work items assigned to people wearing any of the selected Feature Crew tags.

## Behavior

- Renders one interactive `TagPill` per tag actually worn across the tree, plus a neutral **"??"**
  pill when any assignee has no tag yet.
- Clicking a pill toggles it. Multiple selected pills form an **OR** filter (an item shows if its
  assignee wears any selected tag). An empty selection shows everything.
- The **"??"** pill narrows to items assigned to people with no tag.

## Public API

### `renderTagFilterPanel(doc, options): HTMLElement`

- **`tags: (string | null)[]`** — Tags to offer, in display order (`null` = the "??" bucket).
- **`selected: Set<string | null>`** — The active selection; the panel renders it and mutates it on
  toggle (the caller owns this single source of truth).
- **`onChange: (selected) => void`** — Called after a toggle so the caller re-filters the tree and
  re-renders the panel.

The panel is stateless about the selection: it reflects and mutates the caller's set rather than
holding its own, so the tree and the pills never drift out of sync.
