# `common/view-common/control/Breadcrumbs`

A reusable **breadcrumb trail** — a row of clickable segments separated by a glyph — shared by every
view that needs a "you are here" trail (a query's parent folders, a work item's ancestor chain, …).

## Public API

`Breadcrumbs.ts` → `renderBreadcrumbs(doc, options): HTMLElement | null`

Builds a themed `<nav>` of segments, or returns `null` when `options.segments` is empty so the
caller can omit the row entirely rather than mount an empty landmark. A segment with a `url` renders
as a clickable `<a>`; a segment without one renders as plain `<span>` text (same styling), so trails
whose folders have no reliable navigation target never ship broken links.

### Options

| Field       | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `segments`  | The trail entries (`{ label, url? }`), ordered outermost → nearest.  |
| `ariaLabel` | Accessible label for the `nav` landmark. Defaults to `"Breadcrumb"`. |
| `separator` | The glyph shown between segments. Defaults to a forward slash (`/`). |

The control is **data-only**: callers hand it resolved `{ label, url? }` segments; it never scrapes a
page or interprets what a segment means, so the same control serves every view. It is theme-aware via
ADO CSS custom properties (with hard-coded fallbacks): a muted trail with themed link color.

`queryFolderBreadcrumbs.ts` → `queryFolderBreadcrumbs(folderPath, href): BreadcrumbSegment[]`

Turns a loaded query's parent-folder trail into segments that link to each folder in the ADO query
hub, resolved against the page's own `href`. A folder whose link cannot be built (the page is not a
recognizable ADO location) stays plain text. Every enhanced view uses it so their trails match.
