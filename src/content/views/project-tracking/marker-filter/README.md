# Marker Filter Pills

The Project Tracking view's clickable **marker pills**. They narrow the tree to work items flagged
with one of the team's recognized conditions — **Blocked (internal)**, **Blocked by another team**,
**Interrupt** — as configured under _Options → Azure DevOps → Marker tags_.

## Behavior

- A pill appears **the moment any item in the tree carries that marker's Azure DevOps tag**, and
  disappears again when the last one loses it. A pill that could never match anything is a control
  that only knows how to empty the board.
- Clicking a pill toggles it. Selected pills form an **OR**; the group as a whole is **AND**ed with
  the Feature Crew tag group and the recent-activity group. An empty selection narrows nothing.
- A selection whose pill has gone (the item was un-flagged) is dropped, so the filter can never get
  stuck on something with no pill left to unclick.
- A marker the team left **blank** in settings is never carried by anything: a blank tag means "we do
  not use this signal", so it neither offers a pill nor matches an item that happens to wear that
  literal word.

## Public API

### `renderMarkerFilterPills(doc, options): HTMLElement[]`

- **`markers: WorkItemMarker[]`** — Markers to offer, in display order (normally the result of
  `collectMarkersInUse`).
- **`markerTags: WorkItemMarkerTags`** — The team's configured tags, so each pill can name the literal
  ADO tag it stands for in its tooltip.
- **`selected: Set<WorkItemMarker>`** — The active selection; the pills render it and mutate it on
  toggle (the caller owns this single source of truth).
- **`onChange: (selected) => void`** — Called after a toggle so the caller re-filters the tree and
  re-renders the pills.

Like the tag pills beside them, they are returned **loose** rather than wrapped in a panel of their
own — they share the board's single wrapping filter row — and they are stateless about the selection.

### `markerPresence.ts`

Pure, DOM-free predicates so the pills, the tree's visibility test and the tests all read the same
answer:

| Function                                   | Answers                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `itemHasMarker(item, marker, markerTags)`  | Does this item wear the tag configured for this marker?       |
| `collectMarkersInUse(root, markerTags)`    | Which markers are present anywhere in the tree, in order?     |
| `createMarkerFilter(markerTags, selected)` | The predicate the tree narrows by (OR within, unlit = passes) |

Tag comparison is **case-insensitive**, matching Azure DevOps itself — see
[`common/ado/workItemTags`](../../../../common/ado/README.md).
