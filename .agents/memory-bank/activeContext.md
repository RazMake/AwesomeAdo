# Active Context

## Current State

This memory bank is flattened to describe the repository as it stands now — the starting point for
future work. Historical wave-by-wave build notes have been removed; only the current architecture
and decisions are retained (see `systemPatterns.md` and `decisions.md`).

The extension is feature-complete for its current scope:

- Per-query bindings (bind/unbind, view types, per-query properties) with a synced store.
- Top-bar "Enhance with AwesomeADO" button and menu on single-query routes.
- Reversible page blanking as the enhanced-view surface for bound queries resolved to enhanced.
- Options page: Appearance (theme + ADO config + default view), Query Bindings manager, Diagnostics
  placeholder.
- SPA-aware navigation via the background service worker.
- Full quality gate green: `pnpm verify` (format, lint, typecheck, jscpd, script tests, Vitest with
  ≥ 85% coverage, workflow validation), plus build/package/release automation.

## Shared abstractions to build on

- `observeSyncKeys` (`src/common/browser`) — the one place the synced-storage observe race protocol
  lives; both stores use it.
- `AdoHost` (`src/common/navigation`) — the one source of truth for ADO host matching, mirrored by
  the manifest.
- `requestFromTab` (`src/common/browser`) — the shared best-effort tab message round-trip.
- `BrowserSyncQueryBindingStore` owns all read-modify-write of the bindings map
  (`bind`/`unbind`/`setActiveView`).

## Pending (developer / org-owner owned)

- Authenticated in-browser validation in Edge and Chrome for Testing (load, toggle, SPA nav,
  persistence, sync).
- Release-trust activation for the first official `v0.1` release (org controls, baseline, store
  credentials).
