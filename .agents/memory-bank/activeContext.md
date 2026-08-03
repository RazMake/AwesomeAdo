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
  `showAllInWindow`) with a same-size single-window/overlapping-window maximize/restore control that
  stretches the discussion to a ten-pixel inset inside the enhanced-view surface, leaving ADO's top
  and left bars uncovered —
  plus, in their own separated group from `item-commands/MarkerCommands`, Tag with / Clear for the
  two blocked markers (a mandatory reason and `System.Tags` written as ONE patch — the reason rides
  along as a `System.History` op via `WorkItemFieldWriteRequest.comment`, because a separately posted
  comment advances `System.Rev` and gets the tag patch rejected with HTTP 412).
  Every one of those writes also names the value it replaces as
  `WorkItemFieldWriteRequest.baseValue`, which licenses ONE rebase-and-retry when the `/rev` test is
  refused and the field itself is unchanged (ADR-030 amendment) — a drag-reorder, the rank fallback
  and a note posted through the comments API all bump `System.Rev` without reporting the new one, so
  the board's cached rev goes stale on its own.
  `sprint` is now a **data-driven lane-by-state card table** for flat or tree queries: its sticky header composes the
  query's clickable parent-folder breadcrumbs, sprint picker, Lane and Project filters, refresh,
  write-queue state, team-member pills, marker filters, and recent-activity filters. The
  Lane dropdown derives full paths from loaded work but offers only represented leaves, omitting
  any path that is an ancestor of another offered path. The
  rendered table shows only matching exact-path lanes and uses the user's first four application-state
  labels with high-contrast theme-owned Queue/Active/Waiting/Done title colors over quieter fills;
  their light resting tints become 90%-opaque backdrops only while cards scroll beneath them.
  its horizontally synchronized column titles stay pinned at half the header card's resting gap below the sticky control header while
  filter pills scroll beneath them. Each lane's name and per-lane item count stick vertically until
  the next lane pushes them away; there is no table-wide total. Queue through Waiting use tall cards;
  Done cards start compact and expand on activation. Only explicitly configured Primary-work types
  render as cards. Cards expose title, ID, a tag-free shared assignee control, type color, and ETA;
  their row below the title aligns ETA left and, on large cards only, the shared completed/total child badge right. Both
  sizes put ID and assignee in their top corners; compact Done cards keep their own assignee and ETA
  read-only until expanded. A top-right shared ordering picker defaults cards and direct-child rows
  to backlog rank and can switch both to title or ETA for the session. Child rows expose shared
  completion toggles, Assigned To and ETA controls, plus sibling-only title drag ordering under
  backlog-rank mode; all four stay read-only when the parent card is Done. An open popup suspends its owning card's drag
  source until close, remains open after completing or reactivating a child, and lets child title
  drags bubble without the card controller canceling them. Lane names
  are emphasized while their item counts remain visually secondary. Tall cards add clickable recognized marker tags that open only their configured-token Discussion notes, plus a clickable immediate-parent type
  icon/title whose popup lists the type-colored ancestor chain from root to immediate parent with ETA
  controls, read-only when the owning card is Done. Card dragging stays within its lane and uses a
  custom fixed 90%-opaque cursor clone that retains the source card's resolved background across
  columns; the source card remains 90%-opaque. Every destination frames its sticky
  column title with that title's semantic color on a border layer painted above the sticky backdrop;
  under
  backlog-rank ordering the cell continuously resolves pointer position across cards and gaps, shows
  an in-place shadow at a visible destination slot, and appends to an empty destination with title
  highlight only. A cross-column positioned drop coordinates its state patch and rank request in one
  serialized action, while same-cell reordering shows an insertion line. Title/ETA sorting disables
  only reorder. Interactive parent
  controls cannot initiate the card drag. The
  Project filter lists only ancestor chains of work
  surviving the sprint and other active filters, without narrowing its own alternatives. Team pills
  show queue + active counters limited to Primary work and its recursively configured descendants;
  planning-context ancestors do not contribute to member or Unassigned totals. Every pill counter
  explains itself on hover. Marker-tag
  pills show one selected-sprint total except Interrupt, which splits not-yet-accepted from
  accepted-in-sprint work and collapses to one total when none are waiting. Unassigned is derived
  from loaded work. All pill families use Project Tracking's compact Feature
  Crew tag scale, including Project Tracking's activity and row sprint pills. Every filter pill stays
  at full opacity; non-activity and recent-activity pills use separate wrapping families with a larger
  gap in both views. The
  sprint picker omits its filter toggle because Sprint View is always constrained to the selected
  iteration. Initial load and refresh start the original-WIQL read while resolving the sprint,
  page the configured team's complete roster before executing the offset-adjusted query, and retain
  only team-assigned or unassigned work plus parent chains. Lane and Project choices are derived only
  from that retained tree. Sprint changes replace the DOM/session, reset every filter, and reload
  team members, WIQL, work, Lane choices, and Project choices. Its Project dropdown contains only eligible query ancestors
  whose configured types are strict ancestors of Primary-work types; Primary-work and
  implementation-detail types are not project choices. It puts the shared type icon before each
  title, strengthens each type color toward the theme foreground for contrast, grows to the
  viewport margin before truncating long labels, and searches item titles while retaining matching
  ancestor chains. The title's right-click menu always copies the query URL; on a past sprint it can
  bulk-move a confirmed snapshot of visible, assigned, non-Done Primary-work cards to a current/future
  sprint, summarized by Lane and assignee. Filtered-out, unassigned, descendant-only, and newly arrived
  items never enter the snapshot; fresh State/Lane/assignee guards skip changed cards. Cards and direct children reuse Project Tracking item
  commands, then add Sprint-only Interrupt Tag/Accept/Clear commands. New Interrupts retain the inline
  Accepted checkbox preview, but choosing acceptance opens the shared titled Markdown/mention editor;
  Accept stays disabled until a reason exists, and the configured token plus reason rides with the
  tag in one patch. Existing Interrupts use the same dialog. Accepted and unaccepted item pills use
  distinct shared paint: raised is muted purple with a 1px bright edge, while accepted is solid
  purple. Both card sizes expose Priority on the
  top row (compact Done is read-only) and the shared `?` lifecycle/description popup, whose long
  content wraps with vertical-only scrolling. Sprint and Project Tracking derive accepted Interrupt
  state only from a configured acceptance note at or after the latest tag-add revision (ADR-061), so
  an untag/re-tag cycle cannot reuse old acceptance. `project-tracking` is a **data-driven tree board**. Adding a
  view is a folder plus two registrations — see the `add-enhanced-view` skill.
- Data-driven views depend on an injected `EnhancedViewServices` (optional field on
  `EnhancedViewContext`): `loadTree`, `userDirectory`, `getTypes`, `getBoardColumns`, `markerTags`,
  `loadSprintWindow`, `loadTeamMembers`, `loadQueryDefinition`, `noteLoader`,
  `noteActivity`, `interruptAcceptance`, `sprintAreaPaths`, `noteWriter`, `now`, `logger`
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
  split at P2: P2 uses medium-weight, restrained scheme-aware gray while P3+ uses muted secondary text at normal weight;
  all labels use compact padding and close row spacing; popup
  options reuse the same chip format and omit the current value; reads and writes share
  `Microsoft.VSTS.Common.Priority`), a `?` description panel with
  Created/Last-Modified metadata, inline assignee change, and a right-aligned ETA. A header **`⟳`
  refresh** button re-reads the tree + sprint window and repaints in place (ADR-047): the reader's
  transient state lives in a view-owned `BoardSession` (collapsed ids, opened note ids, tag
  selection, sprint pick, session ordering pick, note-panel data/in-flight reads, and the
  `RecentNotesIndex`) plus a captured scroll offset, so a refresh keeps
  their place; it awaits `WorkItemWriteQueue.whenIdle()` first, keeps the board and reports on the
  button when the re-read fails, and never touches ADO's own hidden grid (ADR-029). The tree renders
  every Primary-work type and the planning-context types above it; implementation-detail children
  below the deepest Primary-work level are rolled up inline by the shared `ChildItemsBadge` control
  as a `completed / total` chip (completed = the last board column before Removed) tinted from the
  last configured type's color, whose popup lists each child as
  `{AssignedTo} {title} {ETA} {type icon → ADO}`. Mixed sibling types can show Primary-work rows and
  an implementation-detail badge together. Configurations with no Primary-work flags retain the
  legacy two-level display (ADR-035, ADR-058).
  Settings-backed view configuration changes invalidate and redraw the open enhanced view through
  `QueryPageController` / `EnhancedViewSurface`; theme-only changes continue to recolor the existing
  DOM without rebuilding it.
  Three of the binding's per-query properties are now honored: `orderingPolicy` sorts every level of the
  tree (and the rollup popup) through `common/ordering`, `days` drops an item once its Status has
  sat in the resolved column (the one before Removed) longer than that window, aged from
  `stateChangeDate`, and `weeks` now bounds how far back each item's **notes** are fetched. `hours`
  is honored by the **recent-activity pills** (`common/view-common/control/ActivityFilter`,
  ADR-048): _Newly created_ / _Newly updated_ / _New notes_ sit in the board's wrapping `Filters:`
  row as a separate family after the tag/marker family, OR together, and combine with the sprint and
  tag filters. The first two
  read `createdDate` / `changedDate` off
  the tree; the third is answered by `RecentNotesIndex`, which reads discussions on demand (only when
  the pill is lit, only where `noteCount > 0`, ≤6 in flight, once per board), pages to the newest note
  not beginning with a configured marker `commentTag`, and leaves the board unnarrowed — pill showing
  `New notes…` — until the reads settle (ADR-051).
  The **marker pills** (`common/view-common/control/MarkerPill`) form a third AND-ed group:
  one pill per configured `markerTags` condition that something in the tree actually carries
  (`TrackedWorkItem.tags` ← `System.Tags`, split by `common/ado/workItemTags`), appearing and
  disappearing with the flags themselves. Because a menu command can change which pills EXIST, the
  repaint handed to menu commands refreshes the filter row before the tree (`repaintBoard`). Each
  item row also renders the static amber/red pill for either blocked condition it carries, immediately
  after Assigned To and before its sprint pill; an item carrying both tags shows both pills.
  Each row's title is preceded by its work item **type icon** (`ItemTypeIcon`), which doubles as the
  item's notes toggle — muted closed, bright open. Rows use theme-owned alternating backgrounds in
  visible depth-first order; branch expansion/collapse re-stripes the outline, subtle pointer hover
  highlights one continuous item surface across the row plus its open notes and description panels
  while excluding child rows, and `Ctrl+Shift` strengthens that same complete surface. Existing
  inter-item spacing is balanced toward the bottom of each surface so its final panel has breathing
  room. Opening the icon mounts
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
  wires file transfer and team sharing into the Appearance tab's unified Configuration Sharing card.
  Import replaces bindings wholesale via `IQueryBindingStore.replaceAll`. **Export Connection**
  writes the narrow `AwesomeADO.connection.config` instead (the connected work item id plus the
  organization and project needed to reach it, marked `configScope: "connection"`); importing one
  adopts the connection and, because `ImportedConfig.replacesBindings` is false, never touches the
  reader's enhanced queries (ADR-065).
- Team configuration sharing: Options connects to a same-organization Azure DevOps work item whose
  Description is the authoritative full configuration. Saved-query navigation automatically pulls
  it; Pull Now and explicit conflict-aware Publish controls are available in Appearance. The trusted
  item id syncs separately and becomes a direct ADO link while connected; unchanged pulls do not
  rewrite storage, and Disconnect leaves the last pulled local snapshot intact.
- Shared queries (ADR-064): a saved-query URL may carry `?awesomeAdoConfig={workItemId}`. On a member
  of that item's ADO team it simply connects them to the item; on anyone else (or when membership
  cannot be determined) it creates a read-only link for that ONE query in the synced
  `sharedQueries.workItemIds` map, leaving their settings, bindings, and own team untouched.
  `SharedQueryConfigResolver` reads each work item once, `src/content/shared-query` applies the
  publisher's settings/binding per query and per navigation, and the Query Bindings tab shows the
  query with read-only values, the source work item named, and Remove link in place of Delete.
- Options page: Appearance (Dark/Light/Blue theme, Follow ADO dark/light resolution, default view +
  Configuration Sharing), Azure DevOps config (editable organization/project, team, sprint window,
  board mappings, marker tags, and
  hierarchy Primary work classification with a context-only root), Query Bindings manager (including
  per-query Sprint default Lane paths edited as individually removable, live-project-autocomplete
  rows with adjacent actions and in-card status/error feedback), Diagnostics. The organization and
  project are stored settings (`DetectedValueField`, `src/options/ado-config`): seeded once from the
  open ADO query tab, thereafter only _offered_ as a one-click proposal when the tab disagrees, so
  the tab works with no ADO tab open and the scope travels with file and team configuration.
  ADO metadata is read through ANY open ADO tab (preferring a Query tab), falling back to the saved
  project when that tab names none; with no ADO tab at all there is no credentialed path, so the
  `ado-access-banner` says so and the only ADO-answerable controls — current team, add work item
  type, Connect/Pull/Publish — are disabled while everything stored stays editable.
  Sprint binding defaults and dated per-sprint
  selections round-trip in file and team configuration; connected binding saves publish the proposed
  map before local mutation so an automatic pull cannot erase them. Project Tracking continues deriving its
  eligible paths from live work.
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

## Pending (developer owned)

- Authenticated in-browser validation in Edge and Chrome for Testing (load, toggle, SPA nav,
  persistence, sync).
- Marketplace submission setup: the privacy policy, listing/disclosure/certification text, and
  128x128 listing icon are ready; Chrome still requires a 1280x800 screenshot and 440x280 small
  promotional tile. Both initial store items and their API credentials remain developer-owned.
- Release-trust activation for the first official `v0.1` release. The workflow now requires two
  repository-owned tag rulesets on the personal `RazMake/AwesomeAdo` repository (ADR-057), plus the
  release App, immutable-release policy, protected store environment, baseline variables, and store
  credentials. Live `main` still carries the disabled baseline marker.
