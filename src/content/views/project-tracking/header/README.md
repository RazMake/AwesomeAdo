# `content/views/project-tracking/header`

The **Project Tracking header tile** — the view-specific card shown above the tree board. It is not
a generic control (it hard-codes the board's exact layout), so it lives beside the view rather than
under [`common/view-common/control`](../../../../common/view-common/control).

## Public API

`ProjectTrackingHeader.ts` → `renderProjectTrackingHeader(doc, options): ProjectTrackingHeaderHandle`

Renders a single subtle-filled tile with three bands:

1. **Breadcrumbs** — the query's parent-folder trail (`options.breadcrumbs`, ordered outermost →
   nearest), rendered with the shared
   [`renderBreadcrumbs`](../../../../common/view-common/control/Breadcrumbs/README.md). Each segment
   is a link to that folder; an empty array hides the row.
2. **Title + controls** — the project title (`options.title`, colored by `options.titleColor`) with
   the expand-all (`+`) and collapse-all (`−`) buttons beside it, and the sprint picker
   (`options.sprintPicker`) pinned to the right edge of the same band.
3. **Tech Lead + ETA** — the caller-supplied Tech Lead control (`options.techLead`) followed by the
   root's ETA, rendered with the shared
   [`renderEtaBadge`](../../../../common/view-common/control/EtaBadge/README.md).

The `+`/`−` buttons are vertically centered against the two-line title/tech-lead block.

### Options

| Field          | Meaning                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| `breadcrumbs`  | Clickable parent-folder segments (`{ label, url }`), outermost first.         |
| `title`        | The project (root item) title.                                                |
| `titleColor`   | Hex color for the title, or `null` for the themed default.                    |
| `techLead`     | The Tech Lead control element, or `null` when view services are unavailable.  |
| `eta`          | The root item's ETA (ISO 8601), or `null` when unset.                         |
| `now`          | Reference "now" for the ETA countdown (injected for deterministic rendering). |
| `sprintPicker` | The sprint picker element, pinned to the right of the controls band.          |

### Handle

`renderProjectTrackingHeader` returns `{ element, expandAllButton, collapseAllButton }`. The view
mounts `element` and wires the two buttons to the tree's twisties.

The control composes the controls it is handed (Tech Lead, sprint picker) plus the shared ETA badge
and [`Breadcrumbs`](../../../../common/view-common/control/Breadcrumbs/README.md) controls; it never
reaches for ADO data itself.
