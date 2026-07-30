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

| Option        | Meaning                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `marker`      | Which condition the pill stands for; decides both its wording and its color.            |
| `title`       | Tooltip — normally the Azure DevOps tag the team configured for this marker.            |
| `interactive` | Renders a `<button>` toggle instead of a static `<span>` label (default `false`).       |
| `selected`    | When interactive, whether the pill is part of the active filter (full strength + ring). |
| `onToggle`    | When interactive, called on click; the caller flips its own selection and re-renders.   |

`markerLabel(marker)` returns the same wording the options page labels the marker's row with, for
callers that need the text alone (a tooltip, a log line).

## Notes

- **The colors are fixed, not theme tokens.** A marker pill is a warning whose job is to be told
  apart from the surface under it; a neutral surface token would remove the condition's stable visual
  identity and could blend into the surrounding palette.
- **Text color is per-hue.** White on the amber "blocked" fill is the one combination here that drops
  under a readable contrast ratio, so that pill carries near-black instead.
- **The pill never reads settings.** It is told which marker to paint; the caller supplies the
  configured Azure DevOps tag as the tooltip.
