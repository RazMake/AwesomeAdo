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
  `sprint` / `project-tracking` views. Project Tracking ships as an on-demand ESM renderer; store
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
  vertically until the next lane pushes them away, with no table-wide total. Only Primary-work types
  render as cards, and the shared
  child-items badge lists each card's direct children on large cards only. Both card sizes anchor ID and a tag-free
  shared assignee control in their top corners, then align ETA left and child progress right below
  the title. Compact Done cards keep their own assignee and ETA read-only until expanded. A top-right
  ordering picker defaults cards and direct children to backlog rank and applies title/ETA sorting to
  both. Child popup rows provide completion toggles, shared assignee/ETA controls, and sibling drag
  ordering under backlog rank while suspending card drag for the popup lifetime; Done parents keep
  those controls and child ordering read-only after expansion. Completion repaints preserve the open
  popup, and the card controller does not cancel bubbled child title drags. Lane names are larger and
  their counts are muted. Tall cards show
  recognized tags and a clickable immediate-parent type icon/title whose popup lists the
  type-colored ancestor chain from root to immediate parent with ETA controls, read-only for a Done
  card. Cards move only between state columns in their current lane using a custom 90%-opaque
  cursor clone that retains the source card's original resolved background; the source card remains
  90%-opaque. A border matching the title's semantic color and painted
  above the sticky backdrop frames the destination title; backlog-rank mode shows an in-place shadow at the
  resolved slot between visible cards, survives upward reversal through gaps, and appends to an empty
  destination with title highlight only. One serialized action coordinates state and rank; same-cell
  moves use an insertion line, while cross-lane drops are rejected. Lane choices include only represented leaf area paths. Project
  choices are limited to planning-parent types above Primary work on ancestor chains of currently
  eligible sprint work, prefixed by type icons, colored by type, and searchable by title without dropping matching parents;
  long labels use available viewport width before truncating. Team and
  marker pills use compact counters with hover explanations. Member and Unassigned totals count only
  Primary work and its recursively configured child types. Marker pills show one total except Interrupt's waiting /
  accepted split; every pill matches Project Tracking's Feature Crew tag scale, Unassigned is
  derived from the loaded work. Sprint changes replace the DOM/session, reset all filters, and
  reload team members, work, Lane choices, and Project choices. Both views keep filter pills at full opacity and distinguish non-activity from
  recent-activity pills with a larger gap between wrapping families.
- **Area-path filtering** (`common/view-common/control/AreaPathFilter` + Project Tracking): the live
  tree hydrates `System.AreaPath`; a compact themed header popup selects full paths using shortest
  unique display suffixes, and the session-scoped selection narrows the board without persisting.
  The item right-click menu reuses the same eligible paths and labels to change `System.AreaPath`,
  omitting the item's current value and showing complete paths as tooltips. No pinned area-path
  setting is needed; Sprint View and Project Tracking derive choices from their loaded work items.
- **Markdown authoring** (`common/view-common/control/TextEditor`): shared bold/italic/link shortcuts
  and keyboard-driven ADO `@`-mention insertion across note/comment and description editors; inline
  notes and New notes activity omit configured marker-comment prefixes while View all stays complete.
- **Settings transfer** (`src/common/settings-transfer` + `src/options/settings-transfer`):
  `AwesomeADO.config` export/import and Azure DevOps work-item sharing of the whole configuration,
  grouped in the Appearance tab's Configuration Sharing card.
- **Team configuration sharing** (`common/settings-transfer`, `common/browser`, and Options): one
  same-organization ADO work item Description is the permissioned full-config source; clients
  automatically pull it on saved-query entry and editors explicitly publish with revision conflict
  protection.
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
