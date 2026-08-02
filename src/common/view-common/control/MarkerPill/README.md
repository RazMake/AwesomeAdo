# MarkerPill Control

The colored pill that stands for one of the team's recognized work-item conditions — **Blocked
(internal)** (amber), **Blocked by another team** (red), **Interrupt** (violet).

One control, three surfaces: the Project Tracking item row, the right-click command that applies or
clears the condition, and the board's filter row. The pill inside the menu is a preview of the pill
the item will wear, so all three must be rendered from here rather than painted separately.

## Usage

```ts
import {
  renderMarkerPill,
  markerLabel,
} from "../../common/view-common/control/MarkerPill/MarkerPill";

// Static label, e.g. on an item row or inside a context-menu command
row.append(renderMarkerPill(doc, { marker: "blocked", title: 'Azure DevOps tag "Blocked"' }));

// Interactive filter toggle
row.append(
  renderMarkerPill(doc, {
    marker: "blockedByOtherTeam",
    interactive: true,
    selected: selectedMarkers.has("blockedByOtherTeam"),
    onToggle: repaint,
  }),
);
```

| Option        | Meaning                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `marker`      | Which condition the pill stands for; decides both its wording and its color.           |
| `title`       | Tooltip — normally the Azure DevOps tag the team configured for this marker.           |
| `interactive` | Renders a `<button>` toggle instead of a static `<span>` label (default `false`).      |
| `selected`    | When interactive, whether the pill is part of the active filter (themed ring).         |
| `accepted`    | Interrupt only: solid accepted paint; false uses the muted raised paint.               |
| `counts`      | Optional tag total and Interrupt accepted-in-sprint count, using shared pill geometry. |
| `onToggle`    | When interactive, called on click; the caller flips its own selection and re-renders.  |

`markerLabel(marker)` returns the same wording the options page labels the marker's row with, for
callers that need the text alone (a tooltip, a log line).

`markerPresence.ts` exports the shared `itemHasMarker`, `collectMarkersInUse`, and
`createMarkerFilter` predicates so every view applies the same configured-tag semantics:

| Function                                   | Answers                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `itemHasMarker(item, marker, markerTags)`  | Does this item wear the tag configured for this marker?       |
| `collectMarkersInUse(root, markerTags)`    | Which markers are present anywhere in the tree, in order?     |
| `createMarkerFilter(markerTags, selected)` | The predicate the view narrows by (OR within, unlit = passes) |

Tag comparison is **case-insensitive**, matching Azure DevOps itself — see
[`common/ado`](../../../ado/README.md).

## `renderMarkerFilterPills(doc, options): HTMLElement[]`

The whole filter row, built from the pill above — used by **every** view that filters by marker, so
two views can never disagree about which tag a color stands for.

| Option       | Meaning                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `markers`    | Markers to offer, in display order (Project Tracking passes `collectMarkersInUse`; Sprint passes all of them).     |
| `markerTags` | The team's configured tags, so each pill names the literal ADO tag it stands for in its tooltip.                   |
| `selected`   | The active selection; the pills render it and mutate it on toggle (the caller owns this single source of truth).   |
| `countsFor`  | Optional per-marker counters. A view that can measure a marker's coverage supplies them; one that cannot omits it. |
| `onChange`   | Called after a toggle so the caller re-filters its items and re-renders the pills.                                 |

Selected pills form an **OR**; the group as a whole is **AND**ed with a view's other filter groups,
and an empty selection narrows nothing. Like the tag pills beside them, they are returned **loose**
so a view can compose its own non-activity family, and they are stateless about the selection.

A marker the team left **blank** in settings is never carried by anything: a blank tag means "we do
not use this signal", so it neither matches an item that happens to wear that literal word nor
appears in `collectMarkersInUse`.

## Notes

- **The colors are fixed, not theme tokens.** A marker pill is a warning whose job is to be told
  apart from the surface under it; a neutral surface token would remove the condition's stable visual
  identity and could blend into the surrounding palette.
- **Text color is per-hue.** White on the amber "blocked" fill is the one combination here that drops
  under a readable contrast ratio, so that pill carries near-black instead.
- **The pill never reads settings.** It is told which marker to paint; the caller supplies the
  configured Azure DevOps tag as the tooltip.
- **Accepted and raised Interrupts are intentionally distinct.** Accepted uses the solid bright
  Interrupt purple. Raised uses a 24% purple fill with a 1px bright-purple edge. Item and menu pills
  use their real state; Interrupt filter pills always use the accepted solid paint because they
  represent the condition as a whole rather than one item's acceptance state.
- **Count presentation follows marker semantics.** Normal markers show one tag total. Interrupt
  shows not-yet-accepted and current-lifetime accepted counts when both groups exist, otherwise one
  total.
