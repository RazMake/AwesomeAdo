# Active Context

## Current State

This memory bank is flattened to describe the repository as it stands now — the starting point for
future work. Historical wave-by-wave build notes have been removed; only the current architecture
and decisions are retained (see `systemPatterns.md` and `decisions.md`).

The extension is feature-complete for its current scope:

- Per-query bindings (bind/unbind, view types, per-query properties) with a synced store.
- Top-bar "Enhance with AwesomeADO" button and menu on single-query routes. The button follows ADO's
  command-bar chrome; the rounded popup matches the item right-click menu and follows the selected
  AwesomeADO theme.
- Enhanced-view surface (`src/content/query-page/EnhancedViewSurface`) mounts the bound view's own
  DOM in place of ADO's page and reversibly restores it; it resolves the active view through the
  enhanced-view registry and re-attaches itself if ADO redraws the page. Sprint is eager; Project
  Tracking is a separately built ESM renderer loaded and cached on first use. A generation guard
  drops stale imports, and renderer disposal releases document-scoped root registrations.
- Enhanced views live under `src/content/views/**`, each whole in its own folder: the **config**
  (`ViewType` in `viewCatalog.ts`) beside the **renderer** (`EnhancedView` in
  `enhancedViewRegistry.ts`). The pure contracts (`ViewType`, `EnhancedView`) live in
  `src/common/view-common`. Options imports only `content/views/viewCatalog` (config) — a scoped,
  lint-enforced §6 exception (ADR-027) so it still never bundles view DOM. Shared per-view building
  blocks live in `common/view-common/control/**`: `renderViewScaffold` (placeholder shell) plus the reusable controls
  `DateLabel` (PST date + time-on-hover), `EtaBadge` (ETA date + countdown, colored by urgency for
  active items and by on-time/late outcome for completed items),
  `AssignedTo` (assignee label + inline directory-search picker), `ItemTypeIcon` (the ADO type icon,
  sized in `em` to the title it precedes, dimmable), and `MarkdownText` (author-written content —
  descriptions and notes — rendered as allowlist-rebuilt DOM, with attachment images and
  `@`-mentions; ADR-044), plus `TextEditor` (the one themed in-place editor — one-line or multi-line
  Markdown — behind every note, title and description edit; multi-line editors own bold/italic/link
  shortcuts and typed `@<localId>` identity suggestions, ADR-051), `AreaPathFilter` (the compact
  themed full-path multi-select with shortest unique suffix labels, ADR-053), `MarkerPill` (the theme-owned
  semantic pill for a recognized condition — blocked / blocked-by-another-team / interrupt — shared by
  the tagging commands and the board's filter row) and `ItemContextMenu` (the shared
  per-item right-click menu: Copy Item ID / Copy ADO Url / Open in ADO, the last accented, then a
  rule and whatever commands the CALLER supplies for that item as `run` / `panel` / `submenu`; a
  command may also carry `separatorBefore` to group the caller's own list and `renderLabel` to draw
  its label as nodes rather than text, with `label` then used as the row's `aria-label`; one
  instance per view, opened at the pointer through a zero-size viewport-fixed anchor handed to
  `popupHost` as its trigger). Project Tracking supplies five through
  `content/views/project-tracking/item-commands`: Update title, Update description (written with
  `multilineFormat: "Markdown"`, which `WorkItemFieldWriteRequest` now carries into a second
  `/multilineFieldsFormat/<field>` patch op), Move to another sprint (current + future entries of the
  sprint window, minus the item's own), Change area path (the header filter's eligible full paths,
  labelled identically and minus the item's own), and View all notes (`NotesPanel` with
  `showAllInWindow`) —
  plus, in their own separated group from `item-commands/MarkerCommands`, Tag with / Clear for the
  two blocked markers (a mandatory reason and `System.Tags` written as ONE patch — the reason rides
  along as a `System.History` op via `WorkItemFieldWriteRequest.comment`, because a separately posted
  comment advances `System.Rev` and gets the tag patch rejected with HTTP 412).
  Every one of those writes also names the value it replaces as
  `WorkItemFieldWriteRequest.baseValue`, which licenses ONE rebase-and-retry when the `/rev` test is
  refused and the field itself is unchanged (ADR-030 amendment) — a drag-reorder, the rank fallback
  and a note posted through the comments API all bump `System.Rev` without reporting the new one, so
  the board's cached rev goes stale on its own.
  `sprint` is still a placeholder shell;
  `project-tracking` is now a **data-driven tree board**. Adding a view is a folder plus two
  registrations — see the `add-enhanced-view` skill.
- Data-driven views depend on an injected `EnhancedViewServices` (optional field on
  `EnhancedViewContext`): `loadTree`, `userDirectory`, `getTypes`, `getBoardColumns`, `markerTags`,
  `loadSprintWindow`, `noteLoader`,
  `noteWriter`, `now`, `logger`
  (ADR-032). The normalized tree model + loader/directory contracts live in `common/ado`
  (`TrackedWorkItem`, `TrackedUser`, `TypeCatalogEntry`, `TeamIteration`, `IWorkItemTreeLoader`,
  `ITeamIterationsLoader`, `IUserDirectory`); PST date/ETA math lives in `common/datetime`. `EnhancedViewSurface` takes the
  services once at the content composition root and forwards them per render. Project Tracking renders a
  single-root tree (validates: tree query, exactly one root, root is the first configured type), titles
  the page with the epic (in its type color), shows the epic's assignee as TechLead, a compact area-path
  multi-select, a sprint dropdown +
  on/off filter toggle (pills when off; clicking one offers the other current/future sprints with the
  dropdown's relation styling and moves the item through the shared write queue), per-item expand/collapse,
  and staged header expansion controls:
  `+` opens parent rows before notes, while `−` closes notes/descriptions before parent rows. An editable `PriorityBadge`
  immediately after Status (all priorities share one gray background, with a darker solid fill/edge
  on dark themes; P0/P1 use theme-owned, unmixed red/orange text, later priorities
  split at P2: P2 keeps extra-bold but uses a restrained scheme-aware gray while P3+ uses muted secondary text at normal weight;
  all labels use compact padding and close row spacing; popup
  options reuse the same chip format and omit the current value; reads and writes share
  `Microsoft.VSTS.Common.Priority`), a `?` description panel with
  Created/Last-Modified metadata, inline assignee change, and a right-aligned ETA. A header **`⟳`
  refresh** button re-reads the tree + sprint window and repaints in place (ADR-047): the reader's
  transient state lives in a view-owned `BoardSession` (collapsed ids, opened note ids, tag
  selection, sprint pick, session ordering pick, note-panel data/in-flight reads, and the
  `RecentNotesIndex`) plus a captured scroll offset, so a refresh keeps
  their place; it awaits `WorkItemWriteQueue.whenIdle()` first, keeps the board and reports on the
  button when the re-read fails, and never touches ADO's own hidden grid (ADR-029). The tree is capped at
  **two levels below the root** (`MAX_ROW_DEPTH = 1`); the level under the last rendered row is rolled up
  inline by the shared `ChildItemsBadge` control as a `completed / total` chip (completed = the last board
  column before Removed) tinted from the last configured type's color, whose popup lists each child as
  `{AssignedTo} {title} {ETA} {type icon → ADO}` and honors the active sprint/tag filters (ADR-035).
  Three of the binding's per-query properties are now honored: `orderingPolicy` sorts every level of the
  tree (and the rollup popup) through `common/ordering`, `days` drops an item once its Status has
  sat in the resolved column (the one before Removed) longer than that window, aged from
  `stateChangeDate`, and `weeks` now bounds how far back each item's **notes** are fetched. `hours`
  is honored by the **recent-activity pills** (`content/views/project-tracking/activity-filter`,
  ADR-048): _Newly created_ / _Newly updated_ / _New notes_ sit in the board's single wrapping
  `Filters:` row (tag pills first, activity pills, then marker pills last — every pill a direct child
  of one flex row so
  it reflows as one line), OR together, and combine with the sprint and tag filters. The first two
  read `createdDate` / `changedDate` off
  the tree; the third is answered by `RecentNotesIndex`, which reads discussions on demand (only when
  the pill is lit, only where `noteCount > 0`, ≤6 in flight, once per board), pages to the newest note
  not beginning with a configured marker `commentTag`, and leaves the board unnarrowed — pill showing
  `New notes…` — until the reads settle (ADR-051).
  The **marker pills** (`content/views/project-tracking/marker-filter`) form a third AND-ed group:
  one pill per configured `markerTags` condition that something in the tree actually carries
  (`TrackedWorkItem.tags` ← `System.Tags`, split by `common/ado/workItemTags`), appearing and
  disappearing with the flags themselves. Because a menu command can change which pills EXIST, the
  repaint handed to menu commands refreshes the filter row before the tree (`repaintBoard`). Each
  item row also renders the static amber/red pill for either blocked condition it carries, immediately
  after Assigned To and before its sprint pill; an item carrying both tags shows both pills.
  Each row's title is preceded by its work item **type icon** (`ItemTypeIcon`), which doubles as the
  item's notes toggle — muted closed, bright open. Rows use theme-owned alternating backgrounds in
  visible depth-first order; branch expansion/collapse re-stripes the outline, pointer hover
  highlights the row, and `Ctrl+Shift` strengthens that highlight across the row plus its open notes
  and description panels. Opening the icon mounts
  `content/views/project-tracking/notes` (`NotesPanel` + `NoteRow` + `NoteComposer` + `NoteEditor`):
  the item's ADO Discussion, fetched on FIRST open only (ADR-043), "+ Add note" above a newest-first
  list, and the two most recent days that have non-marker notes shown in full; the explicit View all
  notes popup includes marker comments too (ADR-051). A note reads
  `{author} {date} {text}`; the author's name is clickable only on the reader's own notes and opens
  an inline Markdown editor. Reads/writes go through `EnhancedViewServices.noteLoader` /
  `noteWriter` → `MessagingWorkItemNoteLoader` / `MessagingWorkItemNoteWriter` → the background
  worker's MAIN-world `fetchWorkItemNotesInPage` / `writeWorkItemNoteInPage`
  (`common/browser/WorkItemNoteRequest` contract; URLs from `common/ado/fetchWorkItemNotes`; model
  and windowing in `common/ado/WorkItemNote`). The read also returns the signed-in identity
  (`_apis/ConnectionData`) so ownership can be decided, and classifies every failure
  (`http`/`sign-in`/`network`) rather than reporting an empty discussion.
  `loadTree` now fetches
  **live** from Azure DevOps (ADR-033): the content-side `MessagingWorkItemTreeLoader` (`common/browser`)
  asks the background worker — over the `AdoTreeRequest` message contract — to run a credentialed
  MAIN-world WIQL + `workitemsbatch` fetch (`fetchAdoTreeInPage`, ADR-028), then parses the raw bodies
  with `parseTrackedTree`. Hydration pages run through four bounded lanes and transient reads retry
  up to three attempts with backoff. The sprint dropdown is now **live** too: `loadSprintWindow` reads the
  configured team's iterations via the content-side `MessagingTeamIterationsLoader` (`common/browser`,
  same background/MAIN-world pattern over the `AdoIterationsRequest` contract +
  `fetchAdoIterationsInPage`), then `buildSprintWindow` (`common/ado/sprintWindow`, reusable across any
  sprint-filtering view) centers a window on the current sprint and labels each entry by its offset
  (Current / Next / Previous / N sprints ahead / N sprints ago) plus a past/current/future `relation`
  the picker styles by (past amber, future theme accent, current bold), bounded by the past/future
  sprint-count settings. `userDirectory` is **live** too (ADR-038): `MessagingUserDirectory`
  (`common/browser`) searches ADO's org-scoped Identity Picker over the same background/MAIN-world
  bridge (`AdoIdentityRequest` + `fetchAdoIdentitiesInPage`, URL/body from
  `common/ado/fetchAdoIdentities`). The `AssignedTo` control opens on the project's crew
  (`collectAssignedDirectoryUsers` over the live tree), filters locally, and searches ADO from two
  characters up; picking someone writes `System.AssignedTo` through the board's `WorkItemWriteQueue` and
  repaints only on success (`AssignedToHandle.setUser`).
  `@`-mentions are named by a directory of their own (ADR-046/050): `IMentionDirectory` /
  `MessagingMentionDirectory` (`common/browser`) collects every mention GUID across the board's
  descriptions (and, per panel, its notes) and resolves them over the same background/MAIN-world
  bridge (`AdoIdentityNamesRequest` + `fetchAdoIdentityNamesInPage`, request from
  `common/ado/mentionIdentities`, base from `resolveAdoOrganizationBase`). The endpoint is the
  SAME-ORIGIN Identity Picker (`_apis/IdentityPicker/Identities`, `queryTypeHint: "uid"`), which
  answers one person per request, so the reads run through a bounded pool and the directory's
  session-long memo is what keeps the count proportional to people rather than mentions. The
  board paints first and repaints when names arrive (`BoardHandle.repaint`); a notes panel awaits the
  resolve before building its rows.
  Rows and rolled-up children in their popup can also be **dragged to reorder or change hierarchy
  level** (ADR-040/041): the title is the drag handle, and distinct themed markers distinguish a
  same-parent reorder from a changed parent. Dragging a rolled-up child out closes its popup and
  continues against the tree; same-parent popup reordering reopens on the newly ordered rows after
  each accepted move. `content/views/project-tracking/drag-reorder` decides and previews the move (pure
  `movePlacement` for the placement math, `applyMoveToTree` for the model); persistence goes through
  `EnhancedViewServices.reorderItem` → `MessagingWorkItemReorderWriter` → the background worker, which
  re-points the `System.LinkTypes.Hierarchy-Reverse` link under a `/rev` test, changes the item to the
  destination parent's default child type in that same patch, and then PATCHes the
  team-scoped `_apis/work/workitemsorder` endpoint (`common/ado/reorderWorkItems`,
  `reorderWorkItemInPage`). Drops may stay at the current level or move one adjacent level; demotion
  is allowed only for a source with no children. Dragging is offered only under `MANUAL_ORDERING_POLICY` and
  only with a configured team (the ordering glyph turns faint red with the reason otherwise), ranked
  against the level's **unfiltered** sibling list, and persist-then-reflect on the board's single
  `WorkItemWriteQueue` — which now serializes field writes and moves together (`enqueueReorder`)
  because a re-parent tests the same `/rev` a field write does.
  When ADO **refuses** to rank an item (`TF400486` — an item with no backlog position, or a
  same-category parent/child; permanent, never a concurrency problem), the worker falls back to
  writing `IMPORTANCE_FIELD` itself via `common/ado/rankFallback` +
  `read/writeWorkItemRanksInPage` (ADR-042). The move therefore also carries `siblingIds` (the
  destination level in post-drop order) and reports back `ranks` and `reparented`, which the board
  copies onto its tree.
- Configuration import/export: `src/common/settings-transfer` serializes the whole configuration
  (all settings + every binding) to/from an `AwesomeADO.config` file; `src/options/settings-transfer`
  wires it to the Appearance tab's Import/Export controls. Import replaces bindings wholesale via
  `IQueryBindingStore.replaceAll`.
- Options page: Appearance (Dark/Light/Blue theme, Follow ADO dark/light resolution, default view + import/export), Azure DevOps config, Query
  Bindings manager, Diagnostics.
- SPA-aware navigation via the background service worker.
- Device-local, source-tagged diagnostics log (`src/common/logging`): every line carries the
  component folder that owns the emitting code (e.g. `content/query-page`, `common/settings`,
  `options/alerts`) or the runtime context for composition-root wiring (`background`, `content`,
  `options`); the Diagnostics tab filters by source and errors-only, decision sites log their signals
  and conclusion, and the top-bar menu's **View Log** item deep-links to the Diagnostics tab.
- Full quality gate green: `pnpm verify` (format, lint, typecheck, jscpd, script tests, Vitest with
  ≥ 85% coverage, workflow validation), plus build/package/release automation.

## Shared abstractions to build on

- `observeStorageKeys` (`src/common/browser`) — the one place the storage observe race protocol
  lives; both stores use it.
- `buildTeamScopedApiUrl` (`src/common/ado/fetchAdoMetadata`) — the one place the
  `{base}/{project}/{team}/_apis/…` shape and the "blank team means no URL" rule live; every
  team-owned endpoint (iterations, backlog order) builds through it.
- `AdoHost` (`src/common/navigation`) — the one source of truth for ADO host matching, mirrored by
  the manifest.
- `requestFromTab` (`src/common/browser`) — the shared best-effort tab message round-trip.
- `BrowserSyncQueryBindingStore` owns all read-modify-write of the bindings map
  (`bind`/`unbind`/`setActiveView`), plus `replaceAll` for a wholesale replace (used by config import).
- `ILoggerFactory` (`src/common/logging`) — `forSource(source)` mints a source-tagged `ILogger`
  (source is the owning component folder by convention, e.g. `content/query-page` / `common/settings`,
  a free-form string); injected from composition roots so no class hard-codes its own source. Shared
  stores take the logger as an optional argument (absent = no-op).

## Pending (developer / org-owner owned)

- Authenticated in-browser validation in Edge and Chrome for Testing (load, toggle, SPA nav,
  persistence, sync).
- Marketplace submission setup: the privacy policy, listing/disclosure/certification text, and
  128x128 listing icon are ready; Chrome still requires a 1280x800 screenshot and 440x280 small
  promotional tile. Both initial store items and their API credentials remain developer-owned.
- Release-trust activation for the first official `v0.1` release. Live `main` still carries the
  disabled baseline marker, and the public repository is owned by the personal `RazMake` account
  while the workflow requires organization-owned tag rulesets. The developer must choose between
  transferring the repository to an organization and adapting the trust model for a personal
  repository before the release gate can pass.
