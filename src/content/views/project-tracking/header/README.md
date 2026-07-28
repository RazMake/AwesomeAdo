# `content/views/project-tracking/header`

The **Project Tracking header tile** — the view-specific card shown above the tree board. It is not
a generic control (it hard-codes the board's exact layout), so it lives beside the view rather than
under [`common/view-common/control`](../../../../common/view-common/control).

## Public API

`ProjectTrackingHeader.ts` → `renderProjectTrackingHeader(doc, options): ProjectTrackingHeaderHandle`

Renders a single subtle-filled tile with these bands:

1. **Breadcrumbs + ordering** — the query's parent-folder trail (`options.breadcrumbs`, ordered
   outermost → nearest), rendered with the shared
   [`renderBreadcrumbs`](../../../../common/view-common/control/Breadcrumbs/README.md) using a
   forward-slash separator to match ADO's path style. The trail is derived from the query metadata
   `path` returned by Azure DevOps (the query's folder ancestry, excluding the built-in root and the
   query's own name), trimmed to the **two nearest folders** (the query's parent and its parent's
   parent); an empty array hides the trail. Each segment links to that folder's contents in ADO's
   query hub (`_queries/folder/?path=…`); a segment whose folder URL cannot be resolved falls back to
   plain text. The caller-supplied ordering picker (`options.orderingPicker`) is pinned to the
   **right** of this band — the tile's top-right corner — so the discrete sort indicator stays clear
   of the board's controls. The band is rendered even when there are no breadcrumbs.
2. **Write-queue status** — the caller-supplied write-queue status indicator
   (`options.writeQueueStatus`) on its own right-aligned row directly above the sprint picker.
   Omitted/`null` hides the row; the indicator itself stays hidden while no save is in flight.
3. **Title + controls** — the project title (`options.title`, colored by `options.titleColor`) with
   the expand-all (`+`), collapse-all (`−`) and refresh (`⟳`) buttons beside it, and the sprint picker
   (`options.sprintPicker`) pinned to the right edge of the same band.
4. **Tech Lead + ETA** — the caller-supplied Tech Lead control (`options.techLead`) followed by the
   caller-supplied ETA badge (`options.eta`, built with the shared
   [`renderEtaBadge`](../../../../common/view-common/control/EtaBadge/README.md) so the view owns its
   read/write wiring).

The `+`/`−` buttons are vertically centered against the two-line title/tech-lead block. Refresh shares
that band and that styling but carries a wider left margin: `+`/`−` only rearrange what is already on
screen, while refresh discards the board's data and re-reads it, so sitting them flush would read as
one three-button group and invite the mis-click.

### Options

| Field                | Meaning                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `breadcrumbs`        | Parent-folder segments (`{ label, url? }`), outermost first, trimmed to the two nearest folders.                                  |
| `orderingPicker`     | The board's item-ordering indicator/picker, pinned to the tile's top-right corner.                                                |
| `title`              | The project (root item) title.                                                                                                    |
| `titleColor`         | Hex color for the title, or `null` for the themed default.                                                                        |
| `onTitleContextMenu` | Called when the title is right-clicked, so the view can offer the root item's own menu (omitted leaves the browser's menu alone). |
| `techLead`           | The Tech Lead control element, or `null` when view services are unavailable.                                                      |
| `eta`                | The root item's ETA badge element (pre-built by the view), or `null` when view services are unavailable.                          |
| `sprintPicker`       | The sprint picker element, pinned to the right of the controls band.                                                              |
| `writeQueueStatus`   | The write-queue status indicator, on its own row above the sprint picker (`null`/omitted hides the row).                          |

### Handle

`renderProjectTrackingHeader` returns `{ element, expandAllButton, collapseAllButton, refreshButton }`.
The view mounts `element`, wires the two band buttons to the tree's twisties, and wires
`refreshButton.element` to its own re-read.

`refreshButton` is a `RefreshButtonHandle` — `{ element, setBusy(busy), setFailed(failed) }` — because
a re-read is neither instant nor guaranteed, and the glyph alone cannot tell "still fetching" from
"nothing happened" from "it failed and you are looking at stale data":

- **`setBusy(true)`** disables the button, dims it, and sets `aria-busy`, so a second press cannot
  start a second read.
- **`setFailed(true)`** re-tints the button and rewrites its tooltip to say the board is showing older
  data. It is reported **in place** rather than by adding a chip: the top band's height is pinned, so
  growing one on failure would shove the whole board down at the exact moment the reader is trying to
  work out what changed. The button stays enabled — the view decides what a press means in that
  state.

The caller owns both states: only it knows when the fetch settled.

The control composes the controls it is handed (Tech Lead, sprint picker, ordering picker) plus the
shared ETA badge and
[`Breadcrumbs`](../../../../common/view-common/control/Breadcrumbs/README.md) controls; it never
reaches for ADO data itself.
