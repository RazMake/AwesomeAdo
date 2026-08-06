# Changelog

All notable user-visible changes are recorded here. The package baseline is `0.1.0`; official
builds use the repository's `Major.Minor.Build` release versioning.

## 0.7

### Bug Fixes

- Project Tracking's expand and collapse controls now move through one hierarchy level per click,
  including boards with several planning or Primary-work levels. Expand reaches notes only after
  every row level is open; collapse closes notes and descriptions first, then row levels in reverse.
- Configuration import now refuses marker comment tags that duplicate another well-known marker and
  asks which value must change before saving anything, so marker notes cannot become ambiguous.

## 0.6

### New Features

- Sprint View cards can now be dragged between rows as well as columns: dropping a card in another
  row moves it to that row's area path, and a diagonal drop changes its state and area path together.
  The destination row and column are both highlighted while you drag.
- The Project Tracking board has a new **Assigned To** filter beside the area filter. It offers only
  the people doing the delivery work — not the owners of the planning levels above it — and shows each
  person's Feature Crew tag, so you can narrow the board to one person or to several at once. A row
  stays when the person is on it or on anything beneath it, so picking someone who only ever appears
  on tasks still shows the work those tasks belong to.
- The Project Tracking area filter now clears in one press: click it while it is lit and the filter
  is gone, the same way every other filter on that header behaves. It is also set further from the
  sprint picker, so the sprint's own filter toggle no longer looks like it belongs to the button on
  its left.
- The All Projects Catalog View's tag filter now narrows the board as you build the condition,
  instead of waiting until you close the dropdown, so you can see what each tag leaves behind while
  you pick the next one. Once filters are active, pressing Tags clears them in one step; the dropdown
  no longer carries a separate Clear button.
- Adding a project from the All Projects Catalog View now asks which sprint it starts in, opening on
  your team's current one. The per-query "Iteration path" setting is gone: a sprint moves every two
  weeks, so a saved answer was stale far more often than it was right.
- Enhanced-view header actions are now arranged around how they are used: the All Projects Catalog
  keeps Tags beside a rightmost Refresh; Project Tracking starts with Sprint, then expand/collapse,
  and ends with its filters plus Refresh; Sprint View keeps Lane, Project, and Refresh at the right.
- The **Project query folder** box in Query Bindings now fills almost immediately instead of stalling
  on a long scan of every saved-query folder in the project. It offers the top of the folder tree
  right away and fetches what is inside a folder only when you type or pick it — and only when that
  folder actually holds more. A small spinner now sits at the end of the box, so you can see it
  filling even while the suggestion list is open.

### Bug Fixes

- Project Tracking filters no longer leave unrelated childless planning items pinned at the top of
  the board. They now obey every active filter except Sprint, showing only matching work and the
  planning chain that leads to it.
- Publishing team configuration no longer fails when an unrelated edit advances the connected work
  item's revision at the same moment. A competing configuration publish is still reported as a
  conflict instead of being overwritten.
- Sprint View no longer reorders cards. Dragging a card within a column used to save a backlog
  position derived from what the board happened to be showing, which could quietly change the order
  of items on the Project Tracking board that were never on screen together. Card order now comes
  from the ordering picker in the header, and arranging work by hand belongs on the Project Tracking
  board.
- Sprint View now expands groups added to an Azure DevOps team, so the people inside those groups
  appear as team-member pills and their work stays visible on the sprint board.
- Dragging a row on the Project Tracking board no longer loses drops. Releasing over a spot no row
  owns — the indentation beside an open branch, most often — used to end the gesture with the
  insertion line still on screen and nothing moved. The drop now lands wherever that line was
  showing.
- The "Project query folder" setting now suggests folders several levels deep while keeping every
  Azure DevOps request within its supported limit. All folders found across three rounds participate
  in autocomplete, a loading indicator makes it clear when that list is not ready yet, and any path
  cut off by the textbox shows its complete value on hover.
- The ETA on finished work is now read-only on the Project Tracking and Sprint boards. It had stopped
  being a forecast and become the record of what was promised, so an accidental edit there quietly
  rewrote whether the item landed on time.
- Sprint View now recognizes an accepted Interrupt from its Discussion comment even when Azure
  DevOps omits that comment from the item's update history, so a valid current-lifetime acceptance
  marker paints the solid accepted pill instead of the outlined unaccepted one.

## 0.5

### New Features

- The Project Tracking board can now be bound to a query rooted at any of your planning levels, not
  only the top one. Teams that do not use Epics — or that track a single feature, milestone or
  scenario on its own board — no longer get turned away. Anything you configured as planning context
  above your delivery work is accepted, and the message shown for a query rooted at the wrong kind of
  item now names the types that would work.
- Adds All Projects Catalog View: bind it to a query that returns several top-level items and you get
  one row per project, each opening into its own tree of child items with their child counts. Every
  row — the project and all the work beneath it — shows who it is assigned to, editable right there
  from the same searchable people picker the Project Tracking board uses, and ends with its ETA, so a
  project's date can be read against the dates of the work it depends on; set or clear any of them
  from the date picker at the end of the row. Work item types you have not given an ETA date field
  leave that column empty rather than showing a date nobody can set. Rows alternate between two background shades so a long
  tree stays easy to follow, highlight under the pointer, and highlight more strongly while you hold
  Ctrl+Shift+Alt — the same as the Project Tracking board. Clicking a row does nothing: everything a
  row can do, including opening it in Azure DevOps, is in its right-click menu, so a stray click
  while scrolling or dragging can no longer navigate you away.
  Expand or collapse everything at
  once, re-sort the whole board from the header, refresh it
  in place without losing what you had open, and narrow it with a tag filter that lists every tag
  used anywhere in the results and offers a search box for finding one quickly. The filter builds a
  real condition: tick the tags a project must have, switch between "any of them" and "all of them",
  and mark tags it must NOT have — a project that uses an excluded tag anywhere beneath it drops out
  of the list. It also keeps up with your edits, so a tag you add or clear from a row's menu appears
  in — or leaves — the filter straight away. A tag that every project carries is the query's own
  condition, so it is left out of the filter. Tags are not repeated on the rows themselves, keeping
  the list narrow and readable. The dropdown stays open while you build the condition, so ticking one
  tag no longer ends the click you were in the middle of; the board narrows once you leave the
  dropdown — press Tags again, click the board behind it, or press Escape. Reopening picks up the
  condition already in force so you can adjust it, and Clear inside the dropdown puts the full
  catalog back.
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
  their own tracking query, be marked completed, and gain a new milestone or phase: the same command
  the Project Tracking board offers on its title, so a title box opens at the top of the project's
  own level and the item is created under it, in the project's area and iteration.
- Adds Add work item to the All Projects Catalog View, on the lowest planning level — the item whose
  children are the work your team tracks. It opens a form in the middle of the window, headed by the
  parent the work is being raised under, rather than a title box, because work found mid-flight
  rarely belongs exactly where its parent sits: type a title and a description, and it opens already
  assigned to you, in the parent's area path and in your team's current sprint, each one changeable
  before you create it. The description takes Markdown, @-mentions and pasted links just like every
  other box you write in. Area path and Sprint use the extension's own dropdowns, so the list of
  choices follows your theme instead of appearing as a stark system list; Area path offers only the
  areas work is actually filed in, shortened to just enough of the path to tell them apart. Interrupt
  is the coloured tag itself: click it to mark where the work came from and it lights up exactly as
  it will look on the boards. If it is being accepted into the sprint, tick Accepted beside it and
  say why — that reason is required, takes Markdown too, and is recorded on the item as a note
  carrying your team's own acceptance marker, so the boards count it as an accepted interrupt.
  Everything is saved in one go, so the item is never briefly missing its sprint, its owner or its
  tag.
- Adds Create Project Query: one click gives any item in the catalog — a project, or a milestone or
  phase beneath one — its own Azure DevOps query covering it and
  everything beneath it, saved in the catalog's configured query folder, linked from the item itself, and
  already set up to open in Project Tracking View. Opened in Azure DevOps it is readable on its own —
  it shows title, assignee, state, target and due dates, tags and iteration, ordered by assignee, and
  it leaves out removed work and anything linked in from another project. It is offered only while
  the item has no tracking query yet. A query you linked to the item yourself in Azure DevOps
  counts as its tracking query too: the catalog now shows the link on that row and opens it, instead
  of treating the item as having none. Every row in the tree carries that link, so a phase with its
  own board is one click away from the project that owns it.
- Adds Mark completed, on both a catalog row and the Project Tracking View title: it sets the project
  to the last state of its configured board and asks whether to delete its tracking query too,
  removing the query, its link and its AwesomeADO setup together so nothing stale is left behind.
  When your team shares one configuration, that removal now reaches the shared configuration as well,
  so the deleted query's setup does not return on the next sync and pile up there over time. A
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
- Sprint View's Lanes and Project buttons now say what they narrow: hovering them reads "Filter by
  Area Path" and "Filter by planning items" instead of repeating the button's own name. The Lanes
  tooltip keeps saying that once you pick something, rather than switching to a list of your picks.
- Sprint View's **Change area path** now offers everywhere you might want to move an item, not only
  the lanes that already hold work: every default area path set on the query binding — even an empty
  one — plus every path your tracked work sits in, including a parent path that has work beneath it.
- In **View all notes**, where marker notes and ordinary ones are read together, each marker note now
  carries a small dot in that condition's own colour between the timestamp and the text, so the two
  are still easy to tell apart now that the token is hidden.

### Bug Fixes

- The Query Bindings settings now open straight away instead of sitting blank while Azure DevOps is
  read; the suggestion lists fill themselves in a moment later. The query folder box also reaches the
  whole project now: Azure DevOps only hands over the top of a large query hierarchy, so the folders
  inside one are looked up as you type your way into it.
- Fixes milestones disappearing from the Project Tracking board as soon as the page was reloaded: a
  milestone or phase with no work under it yet was hidden, so the board that offers to add that work
  could never show it. An empty milestone now stays on the board whatever sprint you are filtered to
  — nobody schedules a milestone into a sprint — and one that has picked up work is narrowed by that
  work as before.
- Fixes drags that were silently thrown away on the Project Tracking board: dropping an item right at
  the line between two rows — which is where you aim to land above or below one — could do nothing at
  all, with no error and the insertion line still showing.
- The Project Tracking board's stronger row highlight now needs Ctrl+Shift+Alt rather than
  Ctrl+Shift, which collided with everyday browser and Azure DevOps shortcuts.
- The bookkeeping token AwesomeADO puts at the front of a Blocked, Blocked-by-another-team or
  Interrupt note (`[BLOCKED]`, `[ACCEPTED]`, whatever your team configured) is no longer shown
  anywhere. You never see it reading a note, and you never see it when you open one to correct it —
  it is added and kept behind the scenes, so fixing a typo can no longer un-mark a note or quietly
  turn an accepted Interrupt back into an unaccepted one.
- A marker pill that cannot open its notes now says why on hover — no comment tag configured for that
  condition, no notes on the item, or nothing in the Updates window carrying the token — instead of
  looking clickable and doing nothing. The same reason is recorded in the diagnostics log.
- Fixes right-click menus opening partly off the bottom of the window, which put their last commands
  out of reach depending on exactly where inside a Sprint View card you clicked. A menu too tall to
  open above the pointer now slides up until all of it is on screen.
- Fixes an Interrupt that has not been accepted yet losing its outline on Sprint View and Project
  Tracking cards, so it no longer looked like the pill offered in the right-click menu. Every marker
  pill is now drawn identically wherever it appears — on a card, in a menu, or in the new work item
  form — while a raised Interrupt and an accepted one stay clearly different from each other.
- The default comment tokens for Blocked, Blocked-by-another-team and Interrupt are no longer
  identical out of the box (Blocked-by-another-team now starts as `[BLOCKED!]`), and the Marker tags
  settings now reject a comment tag that duplicates another condition's — two conditions sharing one
  token meant a note could only ever be attributed to one of them.

## 0.4

### New Features

- Shows the AwesomeADO release version discreetly in the lower-right corner of every enhanced-view
  header, so a bug report can name the version it came from. Clicking it opens the extension's store
  listing, where you can check for a newer release.
- Adds a Quick Bootstrap link to Configuration Sharing: one copyable Azure DevOps link that opens an
  enhanced query already pointed at your team's shared configuration, so a teammate can be set up
  over Teams or email without exporting or importing anything. It appears only once you are
  connected to a configuration work item and have at least one enhanced query.

### Bug Fixes

- Fixes edits being refused after you add or correct a note: adding a note counts as a change to the
  work item in Azure DevOps, so every later change to that item — its title, description, sprint,
  area path, status, assignee, ETA or priority — was rejected until the page was reloaded.
- Fixes the same problem after dragging an item to a new position or parent, which could also leave
  later edits rejected — on the item you moved and, when a drop renumbered a whole level, on other
  items in it that you never touched.

## 0.3

### New Features

- Makes Sprint and Project Tracking filters evaluate only Primary work, while preserving arbitrarily
  deep planning context and showing the complete implementation-detail tree beneath matching work.
- Adds a color-matched count to every Sprint View column heading, showing how much Primary work sits
  in that column across all lanes and staying readable while the headings are stuck to the top. Lane
  totals now match those counts exactly.
- Tells you when the filters have hidden everything in Sprint View and Project Tracking, instead of
  leaving a blank area that looks like the view failed to load. The diagnostics log records the
  filter selections that emptied the board, so an empty board can be explained after the fact.

## 0.2

### New Features

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
  the controls that need live Azure DevOps access. When team sharing is connected, the Azure DevOps
  configuration you change on the options page now reaches the shared configuration before an open
  view can pull the old values back, so it stays saved. Your theme and default view are yours alone:
  they follow you across your own devices and are saved in your configuration file, but they are
  never sent to your team, never replaced by a teammate's, and never changed by opening a query
  someone shared with you. Importing a configuration file still applies only to this device, so a
  file can never push itself into the team you are moving away from.
- Expands team sharing with connection-only exports and shareable query links. Teammates can follow
  live shared configuration without replacing their own query list, while people outside the team
  receive a read-only enhancement for only the shared query and keep their own settings untouched.
- The per-query view settings no longer need a Save button. Choosing a view type or changing any of
  its settings is kept straight away, the way the rest of the options page already worked, so
  settings can no longer be lost by leaving the page. A view that still needs a required setting is
  not stored until you fill it in, and the page says which one it is waiting for.

### Bug Fixes

- Fixes clearing a date, such as an ETA, on any enhanced view. Azure DevOps was being asked to set
  the field to nothing at all instead of to empty it, and rejected the change, so the date stayed on
  the item and the edit was reported as failed.
- Refreshing a board now clears the "Couldn't save" warning. The board has just been re-read from
  Azure DevOps, so what it shows is the truth and the earlier warning no longer applies; a change
  rejected after the refresh still raises it again.

## 0.1

### New Features

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
