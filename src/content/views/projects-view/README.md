# `content/views/projects-view`

The **All Projects Catalog View**: presents every top-level item a bound query returns as a "project"
that opens
into its own tree, narrowed by the Azure DevOps tags worn anywhere in that tree. This folder holds
both halves of the view — its configuration and its renderer.

Where [Project Tracking](../project-tracking/README.md) reports on **one** root item in depth, this
view answers "what is going on across all of them?" for a query that returns **many** roots.

## Public API

- `projectsViewType.ts` → the view's config. `projectsViewType: ViewType` has id `"projects"`, label
  `"All Projects Catalog View"`, and five per-query properties:
  - `orderingPolicy` (select) — how projects and their children are ordered; the choices, the
    default, and the raw sort key all come from [`common/ordering`](../../../common/ordering).
  - `projectTag` (text, optional) — the tag that makes a work item part of this catalog. The binding
    form pre-fills it from the saved query's own tag filter. Left empty, the view reads the first
    `System.Tags CONTAINS` filter from the query's WIQL, then falls back to a tag shared by every
    returned project for legacy queries.
  - `newProjectAreaPath` (autocomplete over the project's area paths, optional) — the full area path
    a new project is created under. Left empty, Azure DevOps applies the project's default area.
  - `newProjectIterationPath` (autocomplete over the project's iteration paths, optional) — the full
    iteration path a new project starts in. Left empty, the current Azure DevOps project's root path
    is used.
  - `projectQueryFolder` (autocomplete over the project's query folders, optional) — where **Create
    Project Query** saves tracking queries. The binding form pre-fills it with the folder holding the
    catalog's own query; left empty, that same folder is used at runtime.

  `orderingPolicyOf(properties)` turns a binding's stored string into the typed policy the renderer
  sorts by. The other exported value helpers resolve the configured creation and query-folder
  settings, including their runtime defaults. Use them instead of reading `properties[...]` directly.

- `ProjectsView.ts` → `projectsView: EnhancedView` — the renderer. It is a **deferred** renderer: it
  is emitted as its own web-accessible bundle (`content/projects-view.js`) and resolved on first use,
  so it is not parsed on every ADO page.

- `ProjectsHeader.ts` → `renderProjectsHeader(context, options)` — the sticky header card. `options`
  carries the mounted write-queue indicator and `onTitleContextMenu`, which the title raises.
- `ProjectRow.ts` → `renderProjectRow(item, context, depth)` — one row and, when open, its children.
  The row context supplies `onContextMenu`, the optional `dragReorder` controller, and the full
  `projectSiblingIds` a drop is ranked against.
- `ProjectsTitleMenu.ts` → `buildProjectsTitleCommands(options)` — the catalog-wide commands shown
  under "Copy ADO Url".
- `ProjectCommands.ts` → `buildProjectCommands(options)` — the per-row commands, composed from the
  shared item-editing commands, this view's tag commands, and (for a project only) the shared
  [project-lifecycle commands](../project-tracking/item-commands/README.md).
- `NewProjectRow.ts` → `renderNewProjectRow(options)` — the inline "add a project" row.
- `projectTags.ts` → `tagsInUse(items, excluded?)`, `queryWideTags(roots)`, `queryWideTagNames(roots)`,
  `carriesAnyTag(item, selected)`, `idsKeptByTags(roots, matches)` — the tag vocabulary, the tags that
  are the query's own condition (lower-cased for comparison, and as spelled for writing), and what a
  tag selection keeps.

## What the view shows

- **Project list**: one row per top-level item the query returned, ordered by the ordering policy in
  force and **closed** — the view opens as a list of projects, not as an unrolled tree.
- **Rows**: twisty (only when the row has children the filter kept), work item type icon, the title
  as a deep link into Azure DevOps (in a new tab), the count of children immediately after it, and
  the item's own tags at the right edge. Editing remains in the row's right-click menu so the list
  stays compact.
- **Ordering picker**: the sort glyph in the header's top-right corner names the ordering in force
  and offers the same policies the binding form does. A pick re-sorts every level from the items
  already loaded — no ADO read — and lasts for the life of the board only, so the binding's policy
  stays the order every board opens on (ADR-039).
- **Expanding**: a row's children are built only while it is open, so a large query does not pay for
  branches nobody looked at. The header's `+` / `−` open and close every level at once. What the
  reader opened is remembered by work item id **outside** the DOM, so it survives a repaint and an
  in-place refresh.
- **Tag filter**: lists every distinct tag worn by any loaded item — not just the projects' own — so
  a tag applied three levels down is still selectable. Tags differing only in case are one option. A
  tag **every** project carries is the query's own condition rather than anything about a project, so
  it is neither offered nor shown as a pill (that rule needs at least two projects to be meaningful).
  Selected tags **OR** together: a matching item brings its ancestors (so the project stays
  reachable) and its whole subtree (so a match never looks childless) with it. The dropdown carries a
  quick-search because a team's tag vocabulary is unbounded.
- **Refresh**: `⟳` re-reads the query in place, keeping the outline the reader opened and their tag
  selection. A failed refresh keeps the older board and reports itself on the button; pressing it in
  that state opens the Diagnostics log on the cause.
- **Empty and failed states**: a query that returned nothing says so; a query that could not be read
  says so and records the cause. A tag the refreshed query no longer wears is dropped from the
  selection and logged, so the filter chip and the board can never disagree.

## What the view can change

Every write is persist-then-reflect and rides one serialized queue, whose "Saving…" / "Couldn't
save" indicator sits in the header's top-right corner beside the version marker.

- **Title menu** (right-click the view's name): copies the query's URL, and adds a project. The new
  project is created as the FIRST configured work item type, tagged so the bound query returns it,
  and under the binding's area and iteration paths. The title is typed into an inline row above the
  list; the board is then re-read, because only the query decides what belongs to this catalog.
- **Row menu** (right-click any row): the shared Copy ID / Copy URL / Open in ADO commands, the
  shared Update title / Update description / View all notes commands, plus **Add custom tag**
  (completing against the tags already in use, or a new one typed in) and **Clear custom tag** (the
  project's own tags only — never the tag that keeps it in this query).
- **Project lifecycle** (top-level rows only): **Create Project Query**, disabled once the project
  owns one, and **Mark completed**, which asks whether to delete that query too. A project counts as
  owning one when it carries this extension's stamped link OR a single hand-made hyperlink to a saved
  query; only the stamped one is ever offered for deletion. Both are the shared commands Project
  Tracking's title menu also offers.
- **Reordering**: while the board is on the manual backlog-rank ordering, a project's title is a drag
  handle. A drop re-ranks it against the configured team's backlog — never re-parenting anything —
  and the list repaints only from the ranks Azure DevOps reported back. Every other ordering is
  derived from the items themselves, so titles are not draggable under it.
