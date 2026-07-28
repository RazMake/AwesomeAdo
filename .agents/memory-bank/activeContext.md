# Active Context

## Current State

This memory bank is flattened to describe the repository as it stands now — the starting point for
future work. Historical wave-by-wave build notes have been removed; only the current architecture
and decisions are retained (see `systemPatterns.md` and `decisions.md`).

The extension is feature-complete for its current scope:

- Per-query bindings (bind/unbind, view types, per-query properties) with a synced store.
- Top-bar "Enhance with AwesomeADO" button and menu on single-query routes.
- Enhanced-view surface (`src/content/query-page/EnhancedViewSurface`) mounts the bound view's own
  DOM in place of ADO's page and reversibly restores it; it resolves the active view through the
  enhanced-view registry and re-attaches itself if ADO redraws the page.
- Enhanced views live under `src/content/views/**`, each whole in its own folder: the **config**
  (`ViewType` in `viewCatalog.ts`) beside the **renderer** (`EnhancedView` in
  `enhancedViewRegistry.ts`). The pure contracts (`ViewType`, `EnhancedView`) live in
  `src/common/view-common`. Options imports only `content/views/viewCatalog` (config) — a scoped,
  lint-enforced §6 exception (ADR-027) so it still never bundles view DOM. Shared per-view building
  blocks live in `common/view-common/control/**`: `renderViewScaffold` (placeholder shell) plus the reusable controls
  `DateLabel` (PST date + time-on-hover), `EtaBadge` (ETA date + countdown, colored by urgency),
  `AssignedTo` (assignee label + inline directory-search picker), `ItemTypeIcon` (the ADO type icon,
  sized in `em` to the title it precedes, dimmable), and `MarkdownText` (author-written content —
  descriptions and notes — rendered as allowlist-rebuilt DOM, with attachment images and
  `@`-mentions; ADR-044), plus `TextEditor` (the one themed in-place editor — one-line or multi-line
  Markdown — behind every note, title and description edit) and `ItemContextMenu` (the shared
  per-item right-click menu: Copy Item ID / Copy ADO Url / Open in ADO, the last accented, then a
  rule and whatever commands the CALLER supplies for that item as `run` / `panel` / `submenu`; one
  instance per view, opened at the pointer through a zero-size viewport-fixed anchor handed to
  `popupHost` as its trigger). Project Tracking supplies four through
  `content/views/project-tracking/item-commands`: Update title, Update description (written with
  `multilineFormat: "Markdown"`, which `WorkItemFieldWriteRequest` now carries into a second
  `/multilineFieldsFormat/<field>` patch op), Move to another sprint (current + future entries of the
  sprint window, minus the item's own), and View all notes (`NotesPanel` with `showAllInWindow`).
  `sprint` is still a placeholder shell;
  `project-tracking` is now a **data-driven tree board**. Adding a view is a folder plus two
  registrations — see the `add-enhanced-view` skill.
- Data-driven views depend on an injected `EnhancedViewServices` (optional field on
  `EnhancedViewContext`): `loadTree`, `userDirectory`, `getTypes`, `loadSprintWindow`, `noteLoader`,
  `noteWriter`, `now`, `logger`
  (ADR-032). The normalized tree model + loader/directory contracts live in `common/ado`
  (`TrackedWorkItem`, `TrackedUser`, `TypeCatalogEntry`, `TeamIteration`, `IWorkItemTreeLoader`,
  `ITeamIterationsLoader`, `IUserDirectory`); PST date/ETA math lives in `common/datetime`. `EnhancedViewSurface` takes the
  services once at the content composition root and forwards them per render. Project Tracking renders a
  single-root tree (validates: tree query, exactly one root, root is the first configured type), titles
  the page with the epic (in its type color), shows the epic's assignee as TechLead, a sprint dropdown +
  on/off filter toggle (pills when off), per-item expand/collapse, a `?` description panel with
  Created/Last-Modified metadata, inline assignee change, and a right-aligned ETA. A header **`⟳`
  refresh** button re-reads the tree + sprint window and repaints in place (ADR-047): the reader's
  transient state lives in a view-owned `BoardSession` (collapsed ids, opened note ids, tag
  selection, sprint pick, session ordering pick) plus a captured scroll offset, so a refresh keeps
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
  ADR-048): _Newly created_ / _Newly updated_ / _New notes_ close the board's single wrapping
  `Filters:` row (tag pills first, activity pills last — every pill a direct child of one flex row so
  it reflows as one line), OR together, and combine with the sprint and tag filters. The first two
  read `createdDate` / `changedDate` off
  the tree; the third is answered by `RecentNotesIndex`, which reads discussions on demand (only when
  the pill is lit, only where `noteCount > 0`, ≤6 in flight, once per board) and leaves the board
  unnarrowed — pill showing `New notes…` — until the reads settle.
  Each row's title is preceded by its work item **type icon** (`ItemTypeIcon`), which doubles as the
  item's notes toggle — muted closed, bright open. Opening it mounts
  `content/views/project-tracking/notes` (`NotesPanel` + `NoteRow` + `NoteComposer` + `NoteEditor`):
  the item's ADO Discussion, fetched on FIRST open only (ADR-043), "+ Add note" above a newest-first
  list, and the two most recent days that have notes shown in full. A note reads
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
  with `parseTrackedTree`. The sprint dropdown is now **live** too: `loadSprintWindow` reads the
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
  `@`-mentions are named by a directory of their own (ADR-046): `IMentionDirectory` /
  `MessagingMentionDirectory` (`common/browser`) collects every mention GUID across the board's
  descriptions (and, per panel, its notes) and resolves them in ONE bulk read over the same
  background/MAIN-world bridge (`AdoIdentityNamesRequest` + `fetchAdoIdentityNamesInPage`, URLs from
  `common/ado/mentionIdentities`, base from `resolveAdoIdentityServiceBase`). This is the extension's
  only genuinely CROSS-origin ADO read — bulk identity reads live on the `vssps` service host. The
  board paints first and repaints when names arrive (`BoardHandle.repaint`); a notes panel awaits the
  resolve before building its rows.
  Rows can also be **dragged to reorder** (ADR-040/041): the title is the drag handle, a themed
  insertion line shows the landing spot and a wash names the destination parent when the drop also
  re-parents. `content/views/project-tracking/drag-reorder` decides and previews the move (pure
  `movePlacement` for the placement math, `applyMoveToTree` for the model); persistence goes through
  `EnhancedViewServices.reorderItem` → `MessagingWorkItemReorderWriter` → the background worker, which
  re-points the `System.LinkTypes.Hierarchy-Reverse` link under a `/rev` test and then PATCHes the
  team-scoped `_apis/work/workitemsorder` endpoint (`common/ado/reorderWorkItems`,
  `reorderWorkItemInPage`). Drops are depth-fixed, offered only under `MANUAL_ORDERING_POLICY` and
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
- Options page: Appearance (theme + default view + import/export), Azure DevOps config, Query
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
- Release-trust activation for the first official `v0.1` release (org controls, baseline, store
  credentials).
