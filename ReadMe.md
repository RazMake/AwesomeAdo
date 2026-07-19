# AwesomeADO

AwesomeADO is a Manifest V3 browser extension for Chrome and Edge that enhances Azure DevOps Query
pages. On a Query page it injects an AwesomeADO button into the top bar; other pages are left
untouched. A query is only enhanced once you bind it to a view — until then, and on any unbound
query, ADO's own page is shown unchanged. When a bound query is enhanced the extension hides the
content below the top breadcrumb bar, keeping the breadcrumb navigation visible while preserving the
full ADO DOM for an instant toggle-off.

Behaviour is configured from a themeable, tabbed options page:

- **Appearance**
  - **Theme** — `Auto` (follows Azure DevOps' own active theme), `Light`, `Dark`, or `Blue`.
  - **ADO Configuration** — read-only view of the organization and project of the active ADO
    Query tab.
  - **Default view** — `Enhanced View` (the extension takes over bound queries) or
    `Original ADO View` (bound queries are left untouched). This applies only to queries that have
    been bound to a view.
- **Query Bindings** — bind individual Azure DevOps queries to an enhanced view. Open it from a
  query's AwesomeADO button to bind that query, or pick from the queries you have open. Each bound
  query can be given its own view, saved, or deleted (unbound).

Both the theme and default-view choices sync across the user's devices via `chrome.storage.sync`.

## Prerequisites

| Requirement      | Version              |
| ---------------- | -------------------- |
| Node.js          | 24                   |
| pnpm             | 10.34.5              |
| Chromium minimum | 106 (Chrome or Edge) |

## Install

```sh
pnpm install
```

## Build

```sh
pnpm build          # single build, outputs to dist/
pnpm run build:watch  # watch mode (see static-file limitation below)
```

## Test

```sh
pnpm test           # Vitest unit tests (jsdom)
pnpm test:coverage  # Vitest with V8 coverage (≥ 85% required)
pnpm test:scripts   # node:test for automation scripts
```

## Quality gate

The full quality gate must pass before any change merges:

```sh
pnpm verify
# Runs: format:check → lint → typecheck → duplication → test:scripts → test:coverage → validate:workflows
```

All thresholds are hard-coded: jscpd clone threshold 0, coverage ≥ 85% on all four metrics.
No `--max-warnings` bypass is available for ESLint errors.

## Load the extension unpacked

### Microsoft Edge

1. Run `pnpm build`.
2. Navigate to `edge://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.

### Google Chrome for Testing

1. Run `pnpm build`.
2. Navigate to `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.

## VS Code debug configurations

Two launch configurations are provided in `.vscode/launch.json`:

- **Debug: Edge** — launches Microsoft Edge with the extension loaded from `dist/`. Runs
  `Build: Extension` before launch.
- **Debug: Chrome for Testing** — launches Chrome for Testing at the path provided by the
  `chromeForTestingExecutable` input. Runs `Build: Extension` before launch.

Both configurations store browser profile data under `.debug-profiles/` (git-ignored).

## Static-file watch limitation

The `build:watch` task uses esbuild's import-graph watcher. esbuild only observes files reachable
from the TypeScript entry points. Changes made **only** to `src/manifest.json` or
`src/options/options.html` — without touching a TypeScript source file — do **not** trigger a
rebuild.

**Workaround:** after editing a static file, touch one of the three entry modules or restart the
`Build: Watch` task.

## Project layout

```
src/
  background/index.ts          # Service worker composition root (excluded from coverage)
  common/
    browser/                   # ChromeSyncStorage wraps chrome.storage.sync
    navigation/                # ADO query-route detection + navigation forwarding
    settings/                  # ExtensionSettings contract + BrowserSyncSettingsStore
  content/
    index.ts                   # Content-script composition root (excluded from coverage)
    PageBlanker.ts             # Reversible DOM blanking via injected <style>
    QueryPageController.ts     # Combines setting + URL to decide whether to blank
  options/
    index.ts                   # Options-page composition root (excluded from coverage)
    OptionsController.ts       # Binds checkbox ↔ settings store
    options.html               # Options page markup
  manifest.json                # Extension manifest (version written at build time)
scripts/                       # Node.js automation (build, version, package, publish)
.agents/memory-bank/           # Living documentation for AI agents (see AGENTS.md)
.github/workflows/             # CI and Release pipelines
```

## Developer reference

- **[AGENTS.md](AGENTS.md)** — canonical repository instructions, SOLID principles, command table,
  definition of done, and worker completion contract.
- **[.agents/memory-bank/](.agents/memory-bank/)** — active context, progress, decisions, and
  codebase patterns maintained across agent sessions.

## Developer-owned checks (Wave 4)

The following checks require an authenticated browser session and cannot be automated in CI:

1. Load the extension unpacked in both Edge and Chrome for Testing.
2. Navigate to an Azure DevOps Query page (e.g. `https://dev.azure.com/<org>/<project>/_queries`).
3. Open the extension options page and toggle **Blank the Azure DevOps Query page** on.
4. Verify the Query page is blanked and that toggling off restores it immediately.
5. Verify the setting persists across browser restarts (browser-synced storage).
6. Verify that non-Query ADO pages (e.g. Boards, Repos) are unaffected.
