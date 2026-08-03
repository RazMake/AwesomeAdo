# Progress

This is a flattened snapshot of what exists now, not a build log.

## Implemented

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
  discreetly in its lower-right corner. Project Tracking ships as an on-demand ESM renderer; store
  builds minify it and the always-loaded runtime. Its hierarchy renders Primary work and planning
  ancestors as rows while rolling implementation-detail children into compact badges, and an open
  view redraws immediately when settings-backed configuration changes. Project
  Tracking rows use theme-owned alternating
  backgrounds, with subtle hover and stronger `Ctrl+Shift` emphasis filling each row and its open details as one
  continuous surface while excluding child rows. Their unchanged total spacing is balanced toward
  the bottom of each item, and they are re-striped in visible tree order after outline changes.
  Options imports only `content/views/viewCatalog` (scoped §6
  exception, ADR-027, lint-enforced).
- **Sprint View** (`content/views/sprint`): accepts flat or tree queries; loads the selected
  team's complete paged member roster before executing an offset-adjusted copy of the original WIQL;
  retains only team members' or unassigned work plus parent chains; and renders clickable query-folder breadcrumbs plus an always-active Sprint
  selector, Lane, Project, refresh, write-queue, team, marker, and recent-activity controls; and
  filters a lane-by-state card table. It uses configured labels with high-contrast theme-owned colors
  for Queue, Active, Waiting, and Done over quieter fills; the synchronized column titles stay
  lightly tinted at rest and gain 90%-opaque backdrops while cards scroll beneath them at half the
  header card's resting gap below
  the sticky controls while filter pills scroll beneath them. Per-lane names and item counts stick
  vertically until the next lane pushes them away, with no table-wide total. Sprint, Lane, Project,
  person, marker, and activity filters evaluate only Primary work. Arbitrarily deep planning chains
  remain available as context and complete non-primary descendant trees remain visible in indented
  child rollups. Only Primary-work types
  render as cards, and the shared
  child-items badge lists each card's non-primary descendants on large cards only. Both card sizes anchor ID and a tag-free
  shared assignee control in their top corners, then align ETA left and child progress right below
  the title. Compact Done cards keep their own assignee and ETA read-only until expanded. A top-right
  ordering picker defaults cards and descendant rows to backlog rank and applies title/ETA sorting to
  both. Child popup rows provide completion toggles, shared assignee/ETA controls, and sibling drag
  ordering under backlog rank while suspending card drag for the popup lifetime; Done parents keep
  those controls and child ordering read-only after expansion. Completion repaints preserve the open
  popup, and the card controller does not cancel bubbled child title drags. Lane names are larger and
  their counts are muted. Tall cards show
  clickable recognized tags that open their configured-token Discussion notes and a clickable immediate-parent type icon/title whose popup lists the
  type-colored ancestor chain from root to immediate parent with ETA controls, read-only for a Done
  card. Cards move only between state columns in their current lane using a custom 90%-opaque
  cursor clone that retains the source card's original resolved background; the source card remains
  90%-opaque. A border matching the title's semantic color and painted
  above the sticky backdrop frames the destination title; backlog-rank mode shows an in-place shadow at the
  resolved slot between visible cards, survives upward reversal through gaps, and appends to an empty
  destination with title highlight only. One serialized action coordinates state and rank; same-cell
  moves use an insertion line, while cross-lane drops are rejected. Lane choices include only represented leaf area paths. Project
  choices are limited to planning-parent types above Primary work on ancestor chains of currently
  eligible sprint work, prefixed by type icons, colored by type with stronger themed contrast, and searchable by title without dropping matching parents;
  long labels use available viewport width before truncating. Team and
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
  latest-tag-lifetime acceptance state without exposing Interrupt mutation commands.
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
- **Settings transfer** (`src/common/settings-transfer` + `src/options/settings-transfer`):
  `AwesomeADO.config` export/import, the narrow `AwesomeADO.connection.config` export that carries
  only the connected work item (ADR-065), and Azure DevOps work-item sharing of the whole
  configuration, grouped in the Appearance tab's Configuration Sharing card.
- **Team configuration sharing** (`common/settings-transfer`, `common/browser`, and Options): one
  same-organization ADO work item Description is the permissioned full-config source; clients
  automatically pull it on saved-query entry and editors explicitly publish with revision conflict
  protection. The connected read-only work item ID links directly to that item in ADO.
- **Shared queries** (`common/navigation/SharedQueryLink`, `common/settings-transfer`,
  `common/ado/TeamMembership`, `src/content/shared-query`, `src/options/query-bindings`): a
  saved-query URL carrying `?awesomeAdoConfig={workItemId}` connects a team member outright and gives
  everyone else a read-only, single-query link that changes nothing else. Each work item is read once
  per resolver however many queries point at it (ADR-064).
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
- **Icons**: toolbar/action icons, options header icon, and the SVG button icon.
- **Quality gate**: `pnpm verify` green — Prettier, ESLint, TypeScript, jscpd, `scripts/*` tests,
  Vitest with ≥ 85% coverage on `src/**`, and workflow schema validation.
- **Tooling**: VS Code tasks/launch, husky `pre-commit`/`pre-push`, esbuild build, packaging, and a
  GitHub Actions CI/release pipeline with changelog-validated versioning.
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
