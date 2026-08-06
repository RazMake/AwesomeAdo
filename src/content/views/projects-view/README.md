# `content/views/projects-view`

The **All Projects Catalog View**: presents every top-level item a bound query returns as a "project"
that opens
into its own tree, narrowed by the Azure DevOps tags worn anywhere in that tree. This folder holds
both halves of the view — its configuration and its renderer.

Where [Project Tracking](../project-tracking/README.md) reports on **one** root item in depth, this
view answers "what is going on across all of them?" for a query that returns **many** roots.

## Public API

- `projectsViewType.ts` → the view's config. `projectsViewType: ViewType` has id `"projects"`, label
  `"All Projects Catalog View"`, and four per-query properties:
  - `orderingPolicy` (select) — how projects and their children are ordered; the choices, the
    default, and the raw sort key all come from [`common/ordering`](../../../common/ordering).
  - `projectTag` (text, optional) — the tag that makes a work item part of this catalog. The binding
    form pre-fills it from the saved query's own tag filter. Left empty, the view reads the first
    `System.Tags CONTAINS` filter from the query's WIQL, then falls back to a tag shared by every
    returned project for legacy queries.
  - `newProjectAreaPath` (autocomplete over the project's area paths, optional) — the full area path
    a new project is created under. Left empty, Azure DevOps applies the project's default area.
  - `projectQueryFolder` (autocomplete over the project's query folders, optional) — where **Create
    Project Query** saves tracking queries. The binding form pre-fills it with the folder holding the
    catalog's own query; left empty, that same folder is used at runtime.

  There is deliberately **no** iteration-path setting: a sprint moves every two weeks, so a stored
  answer would be stale far more often than it was right. The add-a-project row asks instead, opening
  on the team's current sprint.

  `orderingPolicyOf(properties)` turns a binding's stored string into the typed policy the renderer
  sorts by. The other exported value helpers resolve the configured creation and query-folder
  settings, including their runtime defaults. Use them instead of reading `properties[...]` directly.

- `ProjectsView.ts` → `projectsView: EnhancedView` — the renderer. It is a **deferred** renderer: it
  is emitted as its own web-accessible bundle (`content/projects-view.js`) and resolved on first use,
  so it is not parsed on every ADO page.

- `ProjectsHeader.ts` → `renderProjectsHeader(context, options)` — the sticky header card, with Tags
  immediately left of Refresh in the rightmost title-band group. `options`
  carries the mounted write-queue indicator and `onTitleContextMenu`, which the title raises.
- `ProjectRow.ts` → `renderProjectRow(item, context, depth)` — one row and, when open, its children.
  The row context supplies `onContextMenu`, `newChildRow` (the inline "add a milestone" box when it
  belongs under that row), the optional `dragReorder` controller, the full `projectSiblingIds` a drop
  is ranked against, and — for the editable assignee and ETA controls — `services`, the board's
  shared write `queue`, and `assigneeSuggestions`.
- `ProjectsTitleMenu.ts` → `buildProjectsTitleCommands(options)` — the catalog-wide commands shown
  under "Copy ADO Url".
- `ProjectCommands.ts` → `buildProjectCommands(options)` — the per-row commands, composed from the
  shared item-editing commands, this view's tag commands, and the shared
  [project-lifecycle commands](../project-tracking/item-commands/README.md) (**Create Project Query**
  on every row, **Mark completed** on projects only).
- `NewWorkItemPanel.ts` → `renderNewWorkItemPanel(options)` — the **Add work item** form, plus the
  `NewWorkItemValues` the caller persists.
- `NewProjectRow.ts` → `renderNewProjectRow(options)` — the inline "add a project" row, including the
  sprint field it opens on the team's current iteration.
- `projectTags.ts` → `tagsInUse(items, excluded?)`, `queryWideTags(roots)`, `queryWideTagNames(roots)`,
  `idsKeptByTagCondition(roots, condition)`, `isEmptyTagCondition(condition)`, and the `TagCondition`
  type — the tag vocabulary, the tags that are the query's own condition (lower-cased for comparison,
  and as spelled for writing), and what a required/excluded tag condition keeps.

## What the view shows

- **Project list**: one row per top-level item the query returned, ordered by the ordering policy in
  force and **closed** — the view opens as a list of projects, not as an unrolled tree.
- **Rows**: twisty (only when the row has children the filter kept), work item type icon, the title,
  and the count of children immediately after it. The title is deliberately **inert** — a click on a
  dense, draggable tree is far more often a slip than an intent, so **Open in ADO** lives in the
  row's right-click menu, where the rest of the editing already is. Rows wear no tag pills: the tag
  vocabulary lives in the header's filter, which is where a reader acts on it.
- **Row controls** (every level, not just projects): after the child count come the **tracking-query
  link** and the **assignee** chip — the same control Project Tracking rows carry, so an item reads
  the same on both surfaces. A milestone or phase beneath a project is run by someone and can be
  reported on in its own right. The chip shows no crew tag pill: a tag is a fact from the project's
  own Feature Crew roster, and this catalog spans many projects without reading any of them.
- **Row backgrounds**: alternating stripes in visible reading order, a subtle pointer hover, and a
  stronger emphasis while **Ctrl+Shift+Alt** is held — the same shared
  [`RowEmphasis`](../../../common/view-common/control/RowEmphasis/README.md) treatment Project
  Tracking uses.
- **ETA**: a row carries one only when its own work item type declares an ETA field, and it is
  editable in place — a type with none shows nothing rather than a dead placeholder. Badges are
  pinned to the right edge, so a project's date is read in the same column as the dates of the work
  beneath it.
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
  it is not offered (that rule needs at least two projects to be meaningful). The vocabulary is
  re-derived on every repaint, so a tag added or cleared from the row menu appears in — or leaves —
  the filter immediately. Each row can be **required** (tick) or **excluded** (the `not` toggle), and
  the `Any`/`All` switch decides whether one required tag is enough or all of them must be present:
  "these two but not that one" is one condition. A required match brings its ancestors (so the
  project stays reachable) and its whole subtree (so a match never looks childless) with it. An
  excluded tag removes every project that **contains** it anywhere beneath them, which is what "show
  me the projects not using X" means. The dropdown carries a quick-search because a team's tag
  vocabulary is unbounded. Every tick narrows the board immediately, because the reader is building
  the condition by watching what it leaves behind — waiting for the dropdown to close would make them
  state the whole thing blind. That is only possible because a filter change repaints the **list**
  rather than the whole surface; a full repaint would rebuild the header and take the open dropdown
  with it. The dropdown **stays open** while the condition is built and closes by pressing **Tags**
  again, clicking the board behind it, or pressing Escape. Once the dropdown is closed, pressing the
  lit **Tags** button clears the whole condition in one step; the dropdown has no separate Clear.
- **Refresh**: `⟳` re-reads the query in place, keeping the outline the reader opened and their tag
  condition. A failed refresh keeps the older board and reports itself on the button; pressing it in
  that state opens the Diagnostics log on the cause.
- **Empty and failed states**: a query that returned nothing says so; a query that could not be read
  says so and records the cause. A tag the tree no longer wears is dropped from the condition and
  logged, so the filter chip and the board can never disagree.

## What the view can change

Every write is persist-then-reflect and rides one serialized queue, whose "Saving…" / "Couldn't
save" indicator sits in the header's top-right corner beside the version marker.

- **Title menu** (right-click the view's name): copies the query's URL, and adds a project. The new
  project is created as the FIRST configured work item type, tagged so the bound query returns it,
  and under the binding's area path. The title is typed into an inline row above the list, which also
  carries a **Sprint** field opening on the team's current iteration — the one value here that cannot
  honestly be decided in advance. Until that list lands, and when the team has no sprints at all, the
  field stands on the Azure DevOps project's own default. The board is then re-read, because only the
  query decides what belongs to this catalog.
- **Row menu** (right-click any row): the shared Copy ID / Copy URL / Open in ADO commands, the
  shared Update title / Update description / View all notes commands, plus **Add custom tag**
  (completing against the tags already in use, or a new one typed in) and **Clear custom tag** (the
  project's own tags only — never the tag that keeps it in this query).
- **Add new milestone/phase** (projects only): the same command Project Tracking offers on its own
  title, so a milestone means one thing on both surfaces. A title box opens at the top of the
  project's own level — opening the project if it was closed — and the item is created as the project
  type's first configured child type, inheriting the project's area and iteration paths. The board is
  then re-read, because the query is what decides the tree this catalog shows. The command is not
  offered on the work beneath a project: planning inside a milestone is done on the board that tracks
  that project.
- **Add work item** (the lowest planning level only — the row whose configured children are the
  team's delivery): opens a form rather than a title box, because this is the one creation whose
  values are not all inherited. It opens in the middle of the window, headed by the item the work is
  raised under (`Parent: …`). It asks for the title and a **Markdown** description — the same box,
  shortcuts and `@` mentions as every other authored value in the extension — opens the assignee on
  whoever is signed in, the area path on the parent's own, and the **Sprint** on the team's current
  one. Both paths use the extension's own themed dropdown rather than a native one, so the open list
  belongs to the board's theme; the areas offered are the **leaves** the catalog uses, named by the
  shortest label that tells them apart, with the full path as the tooltip. The **Interrupt** flag is
  the pill the item will wear: drained of colour while off, and once on, painted raised or accepted
  exactly as the boards paint it. **Accepted** sits on the same line, and ticking it demands a
  reason, which is recorded as a discussion comment carrying the team's own acceptance marker — the
  same token the boards filter accepted interrupts by. Everything lands in ONE creation revision, so
  the item is never briefly mis-filed, and the board is then re-read. It is offered nowhere else: on
  an item whose children are more planning it would quietly create structure, and beneath the
  delivery level it would create implementation detail nobody asked for.
- **Project lifecycle**: **Create Project Query** is offered on **every** row and disabled once that
  item owns one — a milestone or phase is a body of work somebody reports on, and promoting it to a
  top-level project first would be a data change made purely to unlock a command. **Mark completed**,
  which asks whether to delete that query too, stays on top-level rows: work beneath a project is
  finished on the board that tracks it. An item counts as owning a query when it carries this
  extension's stamped link OR a single hand-made hyperlink to a saved query; only the stamped one is
  ever offered for deletion. Both are the shared commands Project Tracking's title menu also offers.
- **Reordering**: while the board is on the manual backlog-rank ordering, a project's title is a drag
  handle. A drop re-ranks it against the configured team's backlog — never re-parenting anything —
  and the list repaints only from the ranks Azure DevOps reported back. Every other ordering is
  derived from the items themselves, so titles are not draggable under it.
