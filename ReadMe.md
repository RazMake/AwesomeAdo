# AwesomeADO

AwesomeADO is a Manifest V3 browser extension for Chrome and Edge that enhances Azure DevOps Query
pages. On a Query page it injects an AwesomeADO button into the top bar; other pages are left
untouched. A query is only enhanced once you bind it to a view — until then, and on any unbound
query, ADO's own page is shown unchanged. When a bound query is enhanced the extension hides the
content below the top breadcrumb bar, keeping the breadcrumb navigation visible while preserving the
full ADO DOM for an instant toggle-off.

Behaviour is configured from a themeable, tabbed options page:

- **Appearance**
  - **Theme** — `Dark`, `Light`, or `Blue`; `Follow Azure DevOps` automatically chooses Dark or
    Light, while Blue is selected manually.
  - **ADO Configuration** — read-only view of the organization and project of the active ADO
    Query tab.
  - **Default view** — `Enhanced View` (the extension takes over bound queries) or
    `Original ADO View` (bound queries are left untouched). This applies only to queries that have
    been bound to a view.
- **Query Bindings** — bind individual Azure DevOps queries to an enhanced view. Open it from a
  query's AwesomeADO button to bind that query, or pick from the queries you have open. Each bound
  query can be given its own view, saved, or deleted (unbound).
- **Team configuration** — connect to a shared Azure DevOps work item whose Description holds the
  full AwesomeADO configuration. Connected users pull additions, changes, and removals whenever a
  saved query opens; an editor explicitly publishes the current configuration from Options.

Personal storage follows the user's browser account via `chrome.storage.sync`. Team configuration
is shared through a work item in the same Azure DevOps organization, so cross-team viewers need its
id, read access to it, and the extension installed.

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

## First release from the personal repository

The release workflow supports the user-owned `RazMake/AwesomeAdo` repository directly. It requires
two repository-owned tag rulesets; do not create organization rulesets or transfer the repository.

1. Create the GitHub App `awesomeado-release-publisher` under the personal account, grant it
   Contents write access, install it only on this repository, and add its client ID as repository
   variable `RELEASE_APP_CLIENT_ID` and its private key as repository secret
   `RELEASE_APP_PRIVATE_KEY`.
2. Under repository **Settings > Rules > Rulesets**, create two active tag rulesets targeting
   `v*`:

- `release-app-version-tag-creation` contains only the creation restriction and gives only the
  release GitHub App `Integration` bypass with mode `always`.
- `immutable-version-tags` contains only update and deletion restrictions, with fetch-and-merge
  disabled and no bypass actors.

3. Enable immutable releases for the repository owner. Add a read token that can query that policy
   as repository secret `IMMUTABLE_RELEASES_READ_TOKEN`.
4. Create the `browser-extension-stores` environment. Disable administrator bypass, allow only the
   `main` branch, require at least one reviewer, and prevent self-review. A personal repository
   therefore needs another collaborator who can approve this environment.
5. Add the Chrome and Edge credentials listed in [store-assets/README.md](store-assets/README.md) as
   environment secrets. The initial store items must already exist; Chrome also needs its 1280x800
   screenshot and 440x280 promotional tile.
6. Keep release activation disabled while these controls are configured. Commit the canonical
   `established` state in `.github/release-baseline.json`, let that commit's CI run succeed, then set
   repository variable `RELEASE_BASELINE_SHA` to that commit SHA and
   `RELEASE_BASELINE_VERSION` to
   `immutable-owner-empty-namespace-reviewed-main-app-tags-v1`.
7. Dispatch **Release** in `recover_ci` mode with the successful baseline commit's CI run ID and
   attempt. The workflow creates the immutable `v0.1.<build>` prerelease and `v0.1` official release,
   then requests store publication after environment approval. Do not create either tag manually.

## Authenticated release checks

The following checks require an authenticated browser session and cannot be automated in CI:

1. Load the extension unpacked in both Edge and Chrome for Testing.
2. Open a saved tree query and verify binding, Project Tracking loading, filters, discussions, and
   an inline write against a test work item.
3. Switch between Project Tracking and Azure DevOps' standard view, including SPA navigation and an
   F5 refresh.
4. Verify themes, configuration import/export, team sharing, and Diagnostics.
5. Verify settings and query bindings persist across browser restarts and sync to another browser
   profile or device.
6. Verify non-Query Azure DevOps pages remain unaffected.
