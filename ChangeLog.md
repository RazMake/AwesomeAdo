# Changelog

All notable user-visible changes are recorded here. The package baseline is `0.1.0`; official
builds use the repository's `Major.Minor.Build` release versioning.

## Next Version

- The Query Bindings settings now open straight away instead of sitting blank while Azure DevOps is
  read; the suggestion lists fill themselves in a moment later. The query folder box also reaches the
  whole project now: Azure DevOps only hands over the top of a large query hierarchy, so the folders
  inside one are looked up as you type your way into it.
- Adds All Projects Catalog View: bind it to a query that returns several top-level items and you get
  one row per project, each opening into its own tree of child items with their tags and child
  counts. Every project row also shows who it is assigned to, editable right there from the same
  searchable people picker the Project Tracking board uses. Every row in the tree — the project and
  all the work beneath it — ends with its ETA, so a project's date can be read against the dates of
  the work it depends on; set or clear any of them from the date picker at the end of the row.
  Expand or collapse everything at
  once, re-sort the whole board from the header, refresh it
  in place without losing what you had open, and narrow it with a tag filter that lists every tag
  used anywhere in the results and offers a search box for finding one quickly. A tag that every
  project carries is the query's own condition, so it is left out of both the rows and the filter.
  Each catalog can override the tag, the area and iteration paths new projects start in, and the
  folder used for project queries. The settings open already filled in from the query you are binding
  — its own tag filter and the folder it lives in — and the path and folder boxes suggest the real
  area paths, iterations, and query folders in your project as you type, matching anywhere in the
  path.
  Right-click the view's title to copy the query's link or add a new project: a title box opens at the
  top of the list and the project is created as your first configured work item type, already tagged
  so the query returns it, and under the area and iteration paths set on the binding. While the board is sorted
  by importance you can also drag a project by its title to re-rank it in the team's backlog.
- Adds a right-click menu to every row of the All Projects Catalog View: copy the item's ID or link,
  open it in Azure DevOps, rename it, rewrite its description, and read or add to its whole
  discussion. Projects can also be tagged from a list of the tags already in use (or a new one you
  type), have a tag cleared again — never the one that keeps the project in the query — be given
  their own tracking query, and be marked completed.
- Adds Create Project Query: one click gives a project its own Azure DevOps query covering it and
  everything beneath it, saved in the catalog's configured query folder, linked from the project itself, and
  already set up to open in Project Tracking View. Opened in Azure DevOps it is readable on its own —
  it shows title, assignee, state, target and due dates, tags and iteration, ordered by assignee, and
  it leaves out removed work and anything linked in from another project. It is offered only while
  the project has no tracking query yet. A query you linked to the project yourself in Azure DevOps
  counts as its tracking query too: the catalog now shows the link on that row and opens it, instead
  of treating the project as having none.
- Adds Mark completed, on both a catalog row and the Project Tracking View title: it sets the project
  to the last state of its configured board and asks whether to delete its tracking query too,
  removing the query, its link and its AwesomeADO setup together so nothing stale is left behind. A
  query AwesomeADO did not create is never deleted — it says so and leaves it alone. If
  Azure DevOps could not be asked which query a project owns, it now says so rather than telling you
  there is nothing to clean up — and Create Project Query waits too, instead of risking a second one.
- You can now add work straight from the Project Tracking board. Right-click the project title for
  "Add new milestone/phase", or right-click any item whose children are the work your team tracks for
  "New work identified". Either opens a box at the top of the list you are adding to, asks only for a
  title, and tells you what the new item inherits — its parent, its area path and its sprint. It is
  created as the first work item type your configured hierarchy allows underneath, appears at the top
  of that list straight away, and is ranked there so it stays put. The new row shows what Azure
  DevOps itself filled in — its priority, its starting state — right away, instead of blanks that
  only fill in on the next refresh.
- Fixes drags that were silently thrown away on the Project Tracking board: dropping an item right at
  the line between two rows — which is where you aim to land above or below one — could do nothing at
  all, with no error and the insertion line still showing.

## 0.4

- Shows the AwesomeADO release version discreetly in the lower-right corner of every enhanced-view
  header, so a bug report can name the version it came from. Clicking it opens the extension's store
  listing, where you can check for a newer release.
- Adds a Quick Bootstrap link to Configuration Sharing: one copyable Azure DevOps link that opens an
  enhanced query already pointed at your team's shared configuration, so a teammate can be set up
  over Teams or email without exporting or importing anything. It appears only once you are
  connected to a configuration work item and have at least one enhanced query.
- Fixes edits being refused after you add or correct a note: adding a note counts as a change to the
  work item in Azure DevOps, so every later change to that item — its title, description, sprint,
  area path, status, assignee, ETA or priority — was rejected until the page was reloaded.
- Fixes the same problem after dragging an item to a new position or parent, which could also leave
  later edits rejected — on the item you moved and, when a drop renumbered a whole level, on other
  items in it that you never touched.

## 0.3

- Makes Sprint and Project Tracking filters evaluate only Primary work, while preserving arbitrarily
  deep planning context and showing the complete implementation-detail tree beneath matching work.
- Adds a color-matched count to every Sprint View column heading, showing how much Primary work sits
  in that column across all lanes and staying readable while the headings are stuck to the top. Lane
  totals now match those counts exactly.
- Tells you when the filters have hidden everything in Sprint View and Project Tracking, instead of
  leaving a blank area that looks like the view failed to load. The diagnostics log records the
  filter selections that emptied the board, so an empty board can be explained after the fact.

## 0.2

- Introduces Sprint View, a team-focused lane-by-status board with sprint, Lane, Project, team
  member, marker, and recent-activity filters; query-folder breadcrumbs; work counts; configurable
  ordering; compact completed cards; child progress; and drag-and-drop state and rank changes.
- Adds complete Sprint planning actions for titles, descriptions, sprints, area paths, assignees,
  ETAs, priorities, discussions, blockers, child completion, and child ordering. Teams can also
  track and accept Interrupts with a reason, and safely move the visible assigned work from a past
  sprint to a current or future sprint after reviewing a Lane-and-assignee summary.
- Adds per-query default Sprint Lanes and team-shared Lane selections for each sprint, with searchable
  area-path setup, multi-select filtering, reset-to-default, and import/export support.
- Adds a Primary work classification that distinguishes independently trackable delivery from
  planning context and implementation details. Sprint View and Project Tracking use it to keep
  delivery work prominent while retaining the surrounding hierarchy and compact child rollups.
- Makes the Azure DevOps organization and project editable, persistent settings. Configuration can
  now use any open Azure DevOps tab, remains available when no tab is open, and clearly disables only
  the controls that need live Azure DevOps access.
- Expands team sharing with connection-only exports and shareable query links. Teammates can follow
  live shared configuration without replacing their own query list, while people outside the team
  receive a read-only enhancement for only the shared query and keep their own settings untouched.

## 0.1

- Initial release for Chrome and Microsoft Edge, adding per-query enhancements to hosted Azure
  DevOps at `dev.azure.com` and `*.visualstudio.com`, with synced query bindings, top-bar controls,
  and session-only switching between AwesomeADO and the standard view.
- Introduces the Project Tracking board: a theme-aware hierarchical view with sprint, area path,
  Feature Crew, recent activity, and blocker filters; configurable ordering; refresh; and compact
  child rollups.
- Supports inline work-item updates for status, priority, assignee, ETA, sprint, area path, title,
  description, and blocker markers, plus drag-and-drop ordering and hierarchy changes with
  conflict-aware Azure DevOps writes.
- Displays and edits Azure DevOps discussions and descriptions with sanitized rich text,
  screenshots, Markdown shortcuts, `@`-mentions, and a maximizable View all notes surface.
- Adds Azure DevOps configuration for teams, areas, work-item mappings and hierarchy, ETA fields,
  marker tags, sprint windows, and per-query Project Tracking behavior.
- Provides Dark, Light, and Blue themes, plus Follow Azure DevOps, consistently across options,
  enhanced views, menus, controls, and status indicators, including live Dark and Light updates when
  following Azure DevOps.
- Supports configuration import/export and team sharing through an Azure DevOps work item, with
  automatic pulls and explicit conflict-aware publishing.
- Includes a device-local Diagnostics log with source and error filtering that keeps query names and
  customer data out of exported diagnostics.
