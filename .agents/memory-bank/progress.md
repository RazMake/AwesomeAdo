# Progress

This is a flattened snapshot of what exists now, not a build log.

## Implemented

- **Configuration picker**: Advanced Configuration Sharing lists a saved query's items in a
  five-column table with ID, name, modification date/time, and modifier name. Ten rows are visible
  before scrolling and rows are ordered by newest modification first; the connected row has a
  highlighted Active marker and bold name, while muted Not active markers switch candidates. A
  full-width spinner row replaces candidate rows while results load, so the connected fallback cannot
  look like the complete result set. The query ID is a normal shared setting, including publish/pull
  and full file transfer. Switching candidates updates the browser-synced source and open pages react
  without navigation; old in-flight pulls follow the newest source. Connection-only export was
  removed from options while legacy imports remain supported. Cross-vendor Edge/Chrome account
  synchronization is not provided by native browser sync.
- **Extension runtime** (`src/`): MV3 manifest; background service worker (SPA navigation
  forwarding + opening extension pages); content script (enhanced-view surface, top-bar button/menu,
  on-demand theme/query-name probes); options page (Appearance with import/export, Azure DevOps
  config, Query Bindings, Diagnostics with a component-filterable activity log).
- **Settings** (`src/common/settings`): normalized Azure DevOps configuration including work-item
  hierarchy links and Primary work classification, plus `ISettingsStore` /
  `BrowserSyncSettingsStore` and its composition factory.
- **Bindings** (`src/common/bindings`): per-query binding model, `IQueryBindingStore` /
  `BrowserSyncQueryBindingStore` (with `bind`/`unbind`/`setActiveView`/`replaceAll`), open-page
  contract, composition factory.
- **Views** (`src/content/views`, contracts in `src/common/view-common`): per-view folders each
  holding a `ViewType` config (in the `VIEW_TYPES` catalog) and an `EnhancedView` renderer (in the
  eager/lazy enhanced-view registry), a shared placeholder shell (`renderViewScaffold`), and
  `sprint` / `project-tracking` views. Every enhanced-view header displays the built extension version
  discreetly in its lower-right corner and wraps complete controls without splitting their labels
  when the viewport is narrow. Project Tracking ships as an on-demand ESM renderer; store
  builds minify it and the always-loaded runtime. Its hierarchy renders Primary work and planning
  ancestors as rows while rolling implementation-detail children into compact badges, and an open
  view redraws immediately when settings-backed configuration changes. Branch twisties appear only
  when at least one child row survives the active filters. Accepted drag reorders are
  checked against their requested sibling interval; mixed work-item types and unranked neighbours
  are corrected through the direct-rank fallback when ADO's team backlog endpoint leaves them out of
  place. New Primary work starts in the view's selected sprint, or the team's current sprint when
  the view has no selection; new planning items still inherit their parent's iteration. Center-row
  drops now return items inside configured parents, even empty or collapsed ones,
  append after the full child list, and convert to the appropriate child type through the existing
  revision-aware move queue. Edge ordering, one-level moves, and leaf-only demotion are preserved.
  A framed Done toggle immediately before Assigned To fills blue while active, keeps every
  ADO state the shared type mapping routes to the completed column plus its planning ancestors,
  includes work outside the normal resolved-age window, composes with the other filters, and
  restores the normal view on its next press. Project
  Tracking rows use theme-owned alternating
  backgrounds, with subtle hover and stronger `Ctrl+Shift+Alt` emphasis filling each row and its open details as one
  continuous surface while excluding child rows (shared `common/view-common/control/RowEmphasis`). Their unchanged total spacing is balanced toward
  the bottom of each item, and they are re-striped in visible tree order after outline changes.
  Options imports only `content/views/viewCatalog` (scoped §6
  exception, ADR-027, lint-enforced).
  Header expansion advances one rendered hierarchy depth per press: shallow-to-deep before notes on
  expand, and details-first then deep-to-shallow on collapse.
- **All Projects Catalog View** (`content/views/projects-view`): the many-root sibling of
  Project
  Tracking (ADR-066). Lists every top-level item a query returns as a collapsed project that opens
  into its own tree; rows show type icon, an inert title (opening in ADO is a menu command), the
  child count beside it, then the item's tracking-query link, assignee chip, and ETA — at every level.
  Editable assignee chips across enhanced views expose a leading × that clears `System.AssignedTo`
  through the shared guarded write path and disappears while unassigned. Tag-enabled assignee chips
  always offer the neutral `??` choice to clear the current Feature Crew tag or contact role.
  Rows wear no tag pills and use the shared `RowEmphasis` stripe/hover/`Ctrl+Shift+Alt` treatment.
  Child DOM is built only while a row is open, and open/closed state lives outside the DOM so
  it survives repaints and in-place refreshes. Its sticky header carries the query breadcrumbs, a
  board-local ordering picker in the top-right corner,
  expand-all/collapse-all, refresh, and a searchable tag filter listing every tag worn anywhere in
  the tree except the ones every project carries (the query's own condition). The filter builds a
  condition: required tags combined Any/All, plus excluded tags that rule out every project
  containing them anywhere beneath. Required matches keep their ancestors and subtree. The
  vocabulary is re-derived on every paint and the condition pruned (and logged) when a tag leaves the
  tree; pressing the lit Tags trigger clears the whole condition, and the popup carries no Clear.
  **Create Project Query** is offered on every row; **Mark completed** on projects only.
  **Add work item** (`projects-view/NewWorkItemPanel`) is offered only on the LOWEST planning level
  (`primaryChildTypeOf`): a centred form headed `Parent: <title>`, asking for a title, a Markdown
  description (`renderMarkdownField`), an assignee (defaulted to `services.currentUser`, kept at its
  natural width), an area path and a Sprint (themed `SelectField`s; the areas are the LEAVES the
  catalog uses, labelled by shortest unique suffix, the Sprint from `loadSprintWindow`), and the
  Interrupt flag — the `MarkerPill` itself as a toggle, grayscaled while off and painted raised or
  accepted once on — with **Accepted** on the same line, whose acceptance demands a Markdown reason
  written under the team's `markerTags().interrupt.commentTag`. Everything lands in ONE
  creation revision (`NewWorkItem` now carries `assignedTo`, `description`, `comment`).
  Per-query settings define the catalog tag,
  new-project area and iteration paths, and generated-query folder; tag, iteration, and folder default
  from the saved query, Azure DevOps project root, and catalog query folder. The generated-query
  folder field indicates while its three-round autocomplete vocabulary is loading and exposes
  clipped full paths on hover. New projects receive all initial fields in one patch. Ships as its
  own on-demand ESM renderer.
- **Catalog Favorites**: title-menu sync exports linked queries across every tag-filtered hierarchy
  level in display order, including collapsed branches, followed by the exact current catalog URL.
  Unlinked items are skipped. The command is always listed but disabled, with the refusal as its
  tooltip, while the worker's status check finds no folder, no Favorites access, or an unsafe
  destination; the popup re-checks and offers Open Options on refusal. Personal
  path autocomplete reads the browser's folder tree and stays editable on read-only shared bindings.
  The separate browser-synced setting participates in full file transfer but never ADO sharing.
  Background validation rechecks the query and destination before replacing Favorites. Authenticated
  Edge validation confirmed autocomplete, Set routing, exact titles/URLs, stale-content removal,
  repeated-sync uniqueness, and the final filtered link; the temporary folder and setting were removed.
  Linked catalog rows also offer **Clear project query** without a state change. Removal deletes
  the query before unlinking, retains the link on DELETE failure, then drops the binding and reloads.
  The expanded traversal and clear action have deterministic regression coverage; authenticated
  browser validation of these follow-up changes remains pending.
  Safety hardening (ADR-082): `bookmarks` is an optional permission requested only from the Options
  **Allow Favorites access** button, and the Favorites path stays disabled (a saved folder read-only)
  until it is granted;
  the Favorites bar root and malformed paths are unrepresentable; sync replaces direct links
  only (subfolders untouched, managed links fail closed); and the completion popup lists removed
  favorites by name with URL tooltips for selective restore until it closes. Deterministic coverage
  exists; authenticated validation of the permission prompt, grant-without-reload, existing-install
  permission migration, and restoring non-HTTP bookmarks remains pending.
- **Consumers View** (`content/views/consumers`, deferred bundle `content/consumers-view.js`,
  ADR-081): a tree query's single root is an undrawn grouping item; level 1 rows are consumers and
  level 2 rows are feature requests. Consumer rows show type and title; request rows additionally
  show an editable status badge. The header shows the grouping root's title in its theme-aware ADO
  work item type color. The binding's
  `requestAreaPaths` (area-path-list, Sprint View's editor, labelled "Request area paths"; legacy
  `consumerAreaPaths` read as a fallback while the new key is absent) and the header AreaPathFilter
  (shared `renderRetainedAreaPathFilter`, mirrored to repeated `areaPath` URL parameters, offering
  the request paths the binding keeps, pruned to offered paths) both restrict REQUESTS only;
  consumers are never area filtered and consumer-card request counts show the filtered count.
  Binding paths include descendants; header picks use exact case-insensitive full paths. When the
  area filters keep no request, the requests list says so. Header `−` / `+` step through
  `treeExpansion.ts` (`collapseStep`: open descriptions → open discussions → deepest open tree
  level; `expandStep`: shallowest closed level), each step logged. Flat, empty,
  multi-root, and consumer-less queries render an empty
  state under the live header. Under importance ordering with a team, a `fixedDepth`
  DragReorderController reorders consumers and reorders/re-parents requests through
  `persistTreeMove` (same backlog rank as Project Tracking); types never change. Refresh, ordering,
  breadcrumbs, write-queue status, and flip-deduped "showing X of Y" logging match the other trees.
  Every displayed item exposes its loaded description through the shared type-colored `?` details
  panel and uses the type icon as the lazy Discussion toggle. Discussion authoring, revision refresh,
  and the right-click **View all notes** popup reuse Project Tracking's notes controls.
  Each consumer's card IS its one row surface: `renderTreeRowLine(..., "is-consumer")` restyled as a
  `32px | 1fr` grid (class `__card`, own outline) holding the `__request-count` pill (a button
  with `aria-expanded`, filled while open; an inert `is-empty` `0` span for none), a `__card-head`
  (`?`, type icon, title), and the `__profile` block in column 2; consumers start closed
  (`session.expandedIds`), and an accepted move opens its target consumer. The wrapper
  (`__consumer`) keeps only the
  gap below it, then the description and notes panels, then `__children`. The card's contextmenu
  opens the consumer's menu from any point except text fields (`input, textarea, [contenteditable]`).
  `profile/consumerProfile.ts` parses Markdown, plain text, or ADO rich-text HTML for
  `serviceName`, `clientId`, `scenario`, `details`, and `contacts` (optional `mentionId`), and
  `readConsumerProfile` also returns each contact's `ContactPlacement` (`line`, `shape`:
  own-line / shared-line / table-row / inline); `sourceLines` is null only for rich text, and
  `headingLine` is a setext heading's underline. The loose reader is split into
  `descriptionText.ts` (line cleanup, list/keyed/table line shapes), `descriptionSections.ts`
  (ATX/setext/emphasis/label headings, fuzzy section names, sub-headings and `Owners:` labels as
  group roles), and `contactEntries.ts` (roles before/after names, emails, mail links, `@<guid>`
  mentions named via the mention directory, `;` and marked comma splits, placeholder/prose
  rejection). `ConsumerProfileLines.ts` always draws the Contacts section (section tooltip
  `RICH_TEXT_CONTACTS_REASON` for rich text) and a stacked `ul` of shared AssignedTo pills (red ×
  via `onRemove`, role = tag, alias = tooltip, primary text + outline) with a Contacts `+`
  (`attachPeoplePicker`); non-own-line contacts are read-only with a per-shape reason. The role
  editor offers `DEFAULT_CONTACT_ROLES` (M1, M2, M3, DEV, PM) before the board's other roles
  (`contactRolesIn`), and its add field reads "Add new role" via AssignedTo's `newTagPlaceholder`.
  `ConsumerContactEditor` serializes add/replace/set-role/remove per consumer and writes one guarded
  `System.Description` Markdown patch (`baseValue`) through the board queue, rewriting or deleting
  only the affected line via `consumerContactsSource.ts`; every edit repaints the list. The theme
  token `--remove-control-color` colours the bare bold × (no disc), tuned per theme for contrast on
  every row background.
  The board opens on the requests list: one list of the shown consumers' requests ordered by the
  board policy across consumers (`renderRequestOnlyRow`: Status, `?`, Discussion, title,
  `__consumer-tag` TagPill hidden while consumers are picked, "Needed by {date}" / "No needed-by
  date" `EtaBadge` wording via shared `item-eta/renderRowEtaBadge`; same item menu with Update parent
  and View all notes; `−` closes panels only, `+` has nothing to open; its own empty state when no
  shown consumer has a request). Under Drag-and-drop order with a team, each request registers a
  depth-0 drag with every listed request id as siblings; `persistMove` maps the drop to the
  request's real consumer (parentId = currentParentId) and enqueues the backlog-rank reorder. Cards
  never drag (glyph: "consumers keep a fixed order"); By ETA disables drag. `CONSUMERS_ORDERING_POLICIES`
  feeds OrderingPicker's `policies` option. The header's **Show consumers** switch
  (`__show-consumers`) sits in ViewHeader `outlineControls`; the mode is the personal synced
  per-query setting `consumersShowConsumersQueryIds` (`PersonalConsumersShowConsumers`, service
  `consumersShowConsumers`), read once with the first load and written on each flip. Header
  filters: Consumer (`ConsumerFilter.ts`, URL `consumer`), Tags (`tag-selection`, URL
  `tags`/`notTags`/`tagMatch`, consumer's own tags, unworn tags pruned and logged), Area. The
  "showing X of Y" log line carries `mode`, area counts, `selectedConsumers`, and `tags`.
  Authenticated browser validation remains pending.
- **Sprint View** (`content/views/sprint`): accepts flat or tree queries; loads the selected
  team's complete paged member roster, recursively expanding direct and nested groups, before
  executing an offset-adjusted copy of the original WIQL;
  retains only team members' or unassigned work plus parent chains; and renders clickable query-folder breadcrumbs plus an always-active Sprint
  selector, Lane, Project, refresh, write-queue, team, marker, and recent-activity controls; and
  filters a lane-by-state card table. Its pills row clears every active Lane, Project, person,
  marker, and activity filter in one action; right-clicking Unassigned instead excludes unassigned
  cards with a bottom-left-to-top-right diagonal in the active outline color. It uses configured labels with high-contrast theme-owned colors
  for Queue, Active, Waiting, and Done over quieter fills; the synchronized column titles stay
  lightly tinted at rest and gain 90%-opaque backdrops while cards scroll beneath them at half the
  header card's resting gap below
  the sticky controls while filter pills scroll beneath them. Per-lane names and item counts stick
  vertically until the next lane pushes them away, with no table-wide total. Horizontal
  synchronization uses relative offsets rather than transformed card-grid ancestors, allowing card
  popups near clipped lane edges to escape to the viewport and remain visible. Sprint, Lane,
  Project, person, marker, and activity filters evaluate only Primary work. Arbitrarily deep planning chains
  remain available as context and complete non-primary descendant trees remain visible in indented
  child rollups. Only Primary-work types
  render as cards, and the shared
  child-items badge lists each card's non-primary descendants on large cards only. Both card sizes anchor ID and a tag-free
  shared assignee control in their top corners, then align ETA left and child progress right below
  the title. Compact Done cards keep their own assignee and ETA read-only until expanded; priority
  stays read-only after expansion. A top-right
  ordering picker defaults cards and descendant rows to backlog rank and applies title/ETA sorting to
  both. Child popup rows provide completion toggles, shared assignee/ETA controls, and sibling drag
  ordering under backlog rank while suspending card drag for the popup lifetime; Done parents keep
  those controls and child ordering read-only after expansion. Completion repaints preserve the open
  popup, and the card controller does not cancel bubbled child title drags. Lane names are larger and
  their counts are muted. Tall cards show
  clickable recognized tags that open their configured-token Discussion notes and a clickable immediate-parent type icon/title whose popup lists the
  type-colored ancestor chain from root to immediate parent with ETA controls, read-only for a Done
  card. Sprint persists no backlog rank: a card drag moves it to another cell only, writing the
  destination column's state, the destination row's area path, or both in one patch, and neither
  cards nor child popup rows can be reordered. Cards move between cells using a custom 90%-opaque
  cursor clone that retains the source card's original resolved background; the source card remains
  90%-opaque. A border matching the title's semantic color and painted
  above the sticky backdrop frames the destination title; backlog-rank mode shows an in-place shadow at the
  resolved slot between visible cards, survives upward reversal through gaps, and appends to an empty
  destination with title highlight only. One serialized action coordinates state and rank; same-cell
  moves use an insertion line, while cross-lane drops are rejected. Lane choices include only represented leaf area paths. Project
  choices default to planning-parent types above Primary work on ancestor chains of currently
  eligible sprint work, stopping at the explicitly marked Project type or otherwise at the parent
  level above deliverables. The binding's `projectFilterDepth=deliverables` option also includes a
  marked Project type's direct non-Primary children; when no Project is marked, it includes the
  closest non-Primary parents of Primary work. Primary work and implementation-detail descendants
  remain excluded. Choices are prefixed by type icons, colored by type with stronger themed contrast,
  and searchable by title without dropping matching parents.
  Across Sprint, Project Tracking, and All Projects Catalog, direct work-item type colors keep ADO's
  hue on light schemes and lift toward the active foreground on dark schemes; long labels use
  available viewport width before truncating. Team and
  marker pills use compact counters with hover explanations. Member and Unassigned totals count only
  Primary work. Marker pills show one total except Interrupt's waiting /
  accepted-current-lifetime split; every pill matches Project Tracking's Feature Crew tag scale, Unassigned is
  derived from the loaded work. Sprint changes replace the DOM/session, reset all filters, and
  reload team members, work, Lane choices, and Project choices. Both views keep filter pills at full opacity and distinguish non-activity from
  recent-activity pills with a larger gap between wrapping families. The title context menu copies
  the query URL; only past sprints can bulk-move a confirmed snapshot of visible, assigned,
  non-Done Primary-work cards to a current/future sprint, with Lane/assignee summaries, atomic
  State/Lane/assignee guards, retries, cancellation, leave protection, and bounded passes. Cards and direct
  children share Project Tracking item commands plus Sprint-only Interrupt Tag/Accept/Clear actions;
  the inline checkbox previews acceptance, while accepting opens the shared titled Markdown/mention
  editor and requires a non-empty reason. The token, reason, and tag share one patch. Accepted and
  raised item pills use muted purple with a 1px bright edge while accepted pills use solid purple.
  Both card sizes expose Priority (compact Done read-only)
  and the shared `?` popup, which wraps long content and scrolls vertically only. Project Tracking uses the same
  latest-tag-lifetime acceptance state, sourced from Discussion notes beginning with the configured
  token even when update history omits the note. Accepted reason pills search the complete
  discussion with cutoff-aware caching rather than reusing a bounded pre-acceptance read, without
  exposing Interrupt mutation commands. **View all notes** reads the complete Discussion history in
  every enhanced view; the Updates window remains an inline-panel display bound only.
- **Area-path filtering** (`common/view-common/control/AreaPathFilter` + both views): the live
  tree hydrates `System.AreaPath`; a compact themed header popup selects full paths using shortest
  unique display suffixes. Active selections match the Project filter's filled communication style
  and retain their count badge; only a filter with no offered paths is disabled. Project Tracking keeps session state. Sprint uses per-query binding
  defaults only when no dated team-shared selection exists for that sprint; saved selections take
  priority on load/refresh/sprint change, and Lane changes auto-publish. Options adds defaults one at
  a time with live project-area autocomplete and per-row removal. The Sprint title menu resets the
  current saved selection to those defaults when at least one exists. The newest ten past sprint
  records are retained. Connected binding edits publish their proposed map before local persistence,
  so team pull, reload, and file export retain the default paths.
  The item right-click menu reuses the same eligible paths and labels to change `System.AreaPath`,
  omitting the item's current value and showing complete paths as tooltips.
- **Markdown authoring** (`common/view-common/control/TextEditor`): shared bold/italic/link shortcuts
  and keyboard-driven ADO `@`-mention insertion across note/comment and description editors; inline
  notes and New notes activity omit configured marker-comment prefixes while View all stays complete.
  `renderMarkdownField` is the same field without the Save/Cancel pair, for a form that commits
  several answers with its own button.
- **Themed single-select** (`common/view-common/control/SelectField`): the extension's own dropdown,
  used wherever a native `<select>` would otherwise open a platform-painted list that follows no
  AwesomeADO theme.
- **Settings transfer** (`src/common/settings-transfer` + `src/options/settings-transfer`):
  `AwesomeADO.config` export/import, the narrow `AwesomeADO.connection.config` export that carries
  only the connected work item (ADR-065), and Azure DevOps work-item sharing of the whole
  configuration, grouped in the Appearance tab's Configuration Sharing card. Duplicate normalized
  marker comment tags block an import before any configuration is saved.
- **Team configuration sharing** (`common/settings-transfer`, `common/browser`, and Options): one
  same-organization ADO work item Description is the permissioned full-config source; clients
  automatically pull it on saved-query entry and editors explicitly publish with revision conflict
  protection. Publishing conditionally retries once across unrelated item revisions without
  overwriting a changed Description. The connected read-only work item ID links directly to that item
  in ADO.
- **Shared queries** (`common/navigation/SharedQueryLink`, `common/settings-transfer`,
  `common/ado/TeamMembership`, `src/content/shared-query`, `src/options/query-bindings`): a
  saved-query URL carrying `?awesomeAdoConfig={workItemId}` connects a team member outright and gives
  everyone else a read-only, single-query link that changes nothing else. Each work item is read once
  per resolver however many queries point at it (ADR-064).
- **Work item collector** (`common/item-collection`, `content/item-collector`): one in-memory
  `ItemCollection` per content runtime, created at the content root and handed to views through
  `EnhancedViewServices.itemCollection`, mirrored by `ItemCollectionSync` through the synced storage
  key `itemCollection` (compact `storedItemCollection` codec) so a collection continues across tabs,
  reloads and devices. Every work item right-click menu offers **Start collecting
  work items** / **End collection** in the standard group (start also collects the clicked item); a body-mounted floating counter (survives
  view repaints and query switches) opens View on left-click and Copy Ids / Copy ADO links / End
  collection on right-click. The counter is draggable and stores its viewport-relative position as a
  personal browser-synced setting. Ctrl+click toggles items through a marked synthetic `contextmenu`
  probe. Authenticated browser validation pending.
- **Navigation** (`src/common/navigation`): `AdoHost` single-source host matching, query-route and
  identity parsing, navigation + theme + query-name message contracts, `NavigationNotifier`.
- **Browser isolation** (`src/common/browser`): `ChromeSyncStorage`, the two ADO tab readers, and
  the shared `observeStorageKeys` / `requestFromTab` helpers. Query tree hydration uses four bounded
  batch lanes and three-attempt transient retry.
- **Logging** (`src/common/logging`): device-local ring-buffer log store, `ILoggerFactory` /
  `LoggerFactory` minting source-tagged `Logger`s (source is the emitting class name, a free-form
  string), `createLoggerFactory` / `createLogging` composition. Diagnostics decisions log their
  signals and conclusion; stores log saves by name only. The Diagnostics view filters sources through
  a searchable multi-select dropdown (`MultiSelectFilter`).
- **Pasted images** (`common/view-common/control/TextEditor/PastedImages.ts`, `IAttachmentUploader`,
  `MessagingAttachmentUploader` + `uploadAttachmentInPage` bridge): every multi-line Markdown editor
  (descriptions, notes and corrections, marker reasons, new work item description/acceptance
  reason) uploads pasted images as ADO attachments and embeds them; Save/Create waits on in-flight
  uploads. Single-line editors (titles, tags) take no images. Cancelled/abandoned edits remove their
  uploads again through `IAttachmentUploader.discard` (`discardAttachmentInPage` DELETE bridge).
  Authenticated browser validation pending.
- **Icons**: toolbar/action icons, options header icon, and the SVG button icon.
- **Quality gate**: `pnpm verify` green — Prettier, ESLint, TypeScript, jscpd, `scripts/*` tests,
  Vitest with ≥ 85% coverage on `src/**`, and workflow schema validation.
- **Tooling**: VS Code tasks/launch, husky `pre-commit`/content-addressed `pre-push`, cached parallel
  static verification, split Node/jsdom Vitest projects, esbuild build, packaging, and a GitHub
  Actions CI/release pipeline with changelog-validated versioning.
- **Marketplace source material**: public privacy policy; Chrome/Edge listing, disclosure,
  permission-justification, and certification text; and a validated 128x128 listing icon.

## Pending (owned outside the coding agents)

- **Authenticated browser validation** (developer): load in Edge and Chrome for Testing; verify
  binding/unbinding, enhanced ↔ standard toggling, SPA navigation, persistence, and cross-device
  sync.
- **Release-trust activation** (developer): configure the personal repository's two repository-owned
  tag rulesets, release App, immutable-release policy, protected store environment, baseline
  variables, and store credentials for the first official `v0.1` release (ADR-057).
- **Marketplace visuals and items** (developer): create both initial store listings. Chrome still
  needs a 1280x800 screenshot and 440x280 small promotional tile; Edge permits omitting them.
