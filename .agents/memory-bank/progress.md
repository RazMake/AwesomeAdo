# Progress

This is a flattened snapshot of what exists now, not a build log.

## Implemented

- **Extension runtime** (`src/`): MV3 manifest; background service worker (SPA navigation
  forwarding + opening extension pages); content script (blanking policy, top-bar button/menu,
  on-demand theme/query-name probes); options page (Appearance, Query Bindings, Diagnostics with a
  component-filterable activity log).
- **Settings** (`src/common/settings`): `theme` + `defaultView` model, `ISettingsStore` /
  `BrowserSyncSettingsStore`, composition factory.
- **Bindings** (`src/common/bindings`): per-query binding model, view catalog, `IQueryBindingStore`
  / `BrowserSyncQueryBindingStore` (with `bind`/`unbind`/`setActiveView`), open-page contract,
  composition factory.
- **Navigation** (`src/common/navigation`): `AdoHost` single-source host matching, query-route and
  identity parsing, navigation + theme + query-name message contracts, `NavigationNotifier`.
- **Browser isolation** (`src/common/browser`): `ChromeSyncStorage`, the two ADO tab readers, and
  the shared `observeSyncKeys` / `requestFromTab` helpers.
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
