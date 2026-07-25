# `content/views/project-tracking/header`

The **Project Tracking header tile** — the view-specific card shown above the tree board. It is not
a generic control (it hard-codes the board's exact layout), so it lives beside the view rather than
under [`common/view-common/control`](../../../../common/view-common/control).

## Public API

`ProjectTrackingHeader.ts` → `renderProjectTrackingHeader(doc, options): ProjectTrackingHeaderHandle`

Renders a single subtle-filled tile with these bands:

1. **Breadcrumbs** — the query's parent-folder trail (`options.breadcrumbs`, ordered outermost →
   nearest), rendered with the shared
   [`renderBreadcrumbs`](../../../../common/view-common/control/Breadcrumbs/README.md) using a
   forward-slash separator to match ADO's path style. The trail is derived from the query metadata
   `path` returned by Azure DevOps (the query's folder ancestry, excluding the built-in root and the
   query's own name), trimmed to the **two nearest folders** (the query's parent and its parent's
   parent); an empty array hides the row. Each segment links to that folder's contents in ADO's query
   hub (`_queries/folder/?path=…`); a segment whose folder URL cannot be resolved falls back to plain
   text.
2. **Write-queue status** — the caller-supplied write-queue status indicator
   (`options.writeQueueStatus`) on its own right-aligned row directly above the sprint picker.
   Omitted/`null` hides the row; the indicator itself stays hidden while no save is in flight.
3. **Title + controls** — the project title (`options.title`, colored by `options.titleColor`) with
   the expand-all (`+`) and collapse-all (`−`) buttons beside it, and the sprint picker
   (`options.sprintPicker`) pinned to the right edge of the same band.
4. **Tech Lead + ETA** — the caller-supplied Tech Lead control (`options.techLead`) followed by the
   root's ETA, rendered with the shared
   [`renderEtaBadge`](../../../../common/view-common/control/EtaBadge/README.md).

The `+`/`−` buttons are vertically centered against the two-line title/tech-lead block.

### Options

| Field              | Meaning                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `breadcrumbs`      | Parent-folder segments (`{ label, url? }`), outermost first, trimmed to the two nearest folders.         |
| `title`            | The project (root item) title.                                                                           |
| `titleColor`       | Hex color for the title, or `null` for the themed default.                                               |
| `techLead`         | The Tech Lead control element, or `null` when view services are unavailable.                             |
| `eta`              | The root item's ETA (ISO 8601), or `null` when unset.                                                    |
| `now`              | Reference "now" for the ETA countdown (injected for deterministic rendering).                            |
| `sprintPicker`     | The sprint picker element, pinned to the right of the controls band.                                     |
| `writeQueueStatus` | The write-queue status indicator, on its own row above the sprint picker (`null`/omitted hides the row). |

### Handle

`renderProjectTrackingHeader` returns `{ element, expandAllButton, collapseAllButton }`. The view
mounts `element` and wires the two buttons to the tree's twisties.

The control composes the controls it is handed (Tech Lead, sprint picker) plus the shared ETA badge
and [`Breadcrumbs`](../../../../common/view-common/control/Breadcrumbs/README.md) controls; it never
reaches for ADO data itself.
