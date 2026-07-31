# Tag Filter Pills

The Project Tracking view's clickable **tag pills**. They filter the tree to work items assigned to
people wearing any of the selected Feature Crew tags.

## Behavior

- Renders one interactive `TagPill` per tag actually worn across the tree, plus a neutral **"??"**
  pill when any assignee has no tag yet.
- Clicking a pill toggles it. Multiple selected pills form an **OR** filter (an item shows if its
  assignee wears any selected tag). An empty selection shows everything.
- The **"??"** pill narrows to items assigned to people with no tag.

## Public API

### `renderTagFilterPills(doc, options): HTMLElement[]`

- **`tags: (string | null)[]`** — Tags to offer, in display order (`null` = the "??" bucket).
- **`selected: Set<string | null>`** — The active selection; the pills render it and mutate it on
  toggle (the caller owns this single source of truth).
- **`onChange: (selected) => void`** — Called after a toggle so the caller re-filters the tree and
  re-renders the pills.

The pills are returned **loose**, not wrapped in a panel, so the board can place them beside marker
pills in the non-activity family. That family is separated from recent activity by the shared larger
family gap.

They are stateless about the selection: they reflect and mutate the caller's set rather than holding
their own, so the tree and the pills never drift out of sync.
