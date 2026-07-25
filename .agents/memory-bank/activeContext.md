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
  blocks live in `views/shared` (today `renderViewScaffold`, the placeholder shell). `sprint` and
  `project-tracking` are the reference views. Adding a view is a folder plus two registrations — see
  the `add-enhanced-view` skill.
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

- `observeSyncKeys` (`src/common/browser`) — the one place the synced-storage observe race protocol
  lives; both stores use it.
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
