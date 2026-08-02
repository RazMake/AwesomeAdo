# marker-reasons

The **Blocked** / **Blocked by another team** / **Interrupt** pill an item wears in Project Tracking
or Sprint View, and the notes that say why it wears it.

A pill states a condition but never its reason. Reading one used to mean opening the item's whole
discussion and picking the marker notes out of it by eye, so the board's own claim was the one thing
on screen you could not check where it was made.

## Public API

```ts
import { renderMarkerReasonsPill } from "./marker-reasons/MarkerReasonsPill";

row.append(
  renderMarkerReasonsPill({
    doc,
    item,
    marker: "blocked",
    tags: services.markerTags().blocked,
    notesSinceIso: noteWindowStart(services.now(), updatesWindowWeeks(properties)),
    services,
  }),
);
```

`renderMarkerReasonsPill(options)` returns the pill wrapped in its own positioned shell.

| Option          | Meaning                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `item`          | The work item the pill belongs to; its discussion is what the popup reads.                     |
| `marker`        | Which recognized condition the pill stands for — decides its wording and its color.            |
| `tags`          | That marker's configured Azure DevOps **tag** and **comment token**.                           |
| `notesSinceIso` | Start of the binding's **Updates window (weeks)**; nothing older is fetched.                   |
| `services`      | The narrow notes slice of `EnhancedViewServices` (read/write, mentions, marker tags, logging). |

## Behaviour

- A marker with a positive discussion count reads its filtered notes before deciding whether it is
  interactive. Clicking a ready pill opens the item's notes **filtered to that marker's comment token** — the
  `[BLOCKED]` notes under a Blocked pill, and nothing else.
- A marker with no matching notes stays a plain pill with the tooltip **No notes**. A clickable pill
  carries no tooltip.
- Every focused marker note omits its configured token (`[BLOCKED]`, `[ACCEPTED]`, and so on) and
  shows only the reader-authored explanation; the stored/editable source remains complete.
- The popup carries **no composer**. A note typed there would not begin with the token, so it would
  vanish from the very list it was written in — which reads as a lost note.
- A marker whose team configured **no comment token** stays a plain `No notes` label because no note
  can be identified as belonging to that marker.
- The click is kept off the row underneath, which opens the item's own notes panel.

## Files

| File                   | Role                                                      |
| ---------------------- | --------------------------------------------------------- |
| `MarkerReasonsPill.ts` | The pill, its popup, and the filtered notes panel inside. |
