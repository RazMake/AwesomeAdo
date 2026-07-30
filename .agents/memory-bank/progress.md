# Progress

This is a flattened snapshot of what exists now, not a build log.

## Implemented

- **Extension runtime** (`src/`): MV3 manifest; background service worker (SPA navigation
  forwarding + opening extension pages); content script (enhanced-view surface, top-bar button/menu,
  on-demand theme/query-name probes); options page (Appearance with import/export, Azure DevOps
  config, Query Bindings, Diagnostics with a component-filterable activity log).
- **Settings** (`src/common/settings`): `theme` + `defaultView` model, `ISettingsStore` /
  `BrowserSyncSettingsStore`, composition factory.
- **Bindings** (`src/common/bindings`): per-query binding model, `IQueryBindingStore` /
  `BrowserSyncQueryBindingStore` (with `bind`/`unbind`/`setActiveView`/`replaceAll`), open-page
  contract, composition factory.
- **Views** (`src/content/views`, contracts in `src/common/view-common`): per-view folders each
  holding a `ViewType` config (in the `VIEW_TYPES` catalog) and an `EnhancedView` renderer (in the
  `ENHANCED_VIEWS` registry), a shared placeholder shell (`renderViewScaffold`), and `sprint` /
  `project-tracking` views. Project Tracking rows use theme-owned alternating backgrounds with
  hover and `Ctrl+Shift` emphasis across each row and its open details, re-striped in visible tree
  order after outline changes. Options imports only `content/views/viewCatalog` (scoped §6
  exception, ADR-027, lint-enforced).
- **Area-path filtering** (`common/view-common/control/AreaPathFilter` + Project Tracking): the live
  tree hydrates `System.AreaPath`; a compact themed header popup selects full paths using shortest
  unique display suffixes, and the session-scoped selection narrows the board without persisting.
- **Markdown authoring** (`common/view-common/control/TextEditor`): shared bold/italic/link shortcuts
  and keyboard-driven ADO `@`-mention insertion across note/comment and description editors; inline
  notes and New notes activity omit configured marker-comment prefixes while View all stays complete.
- **Settings transfer** (`src/common/settings-transfer` + `src/options/settings-transfer`):
  `AwesomeADO.config` export/import of the whole configuration, wired to the Appearance tab.
- **Navigation** (`src/common/navigation`): `AdoHost` single-source host matching, query-route and
  identity parsing, navigation + theme + query-name message contracts, `NavigationNotifier`.
- **Browser isolation** (`src/common/browser`): `ChromeSyncStorage`, the two ADO tab readers, and
  the shared `observeStorageKeys` / `requestFromTab` helpers.
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

## Pending (owned outside the coding agents)

- **Authenticated browser validation** (developer): load in Edge and Chrome for Testing; verify
  binding/unbinding, enhanced ↔ standard toggling, SPA navigation, persistence, and cross-device
  sync.
- **Release-trust activation** (org owner): organization controls, release baseline, and store
  credentials for the first official `v0.1` release.
