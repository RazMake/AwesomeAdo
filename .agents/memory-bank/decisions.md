# Decisions

## ADR-001: Target browsers

- Decision: Chrome + Edge (both Chromium MV3)
- Rationale: Single build serves both stores

## ADR-002: Language

- Decision: TypeScript (strict)
- Rationale: Type safety requirement

## ADR-003: Runtime

- Decision: Node 24
- Rationale: Matches verified local runtime and current GitHub Actions runtimes

## ADR-004: Package manager

- Decision: pnpm 10.34.5
- Rationale: Current stable pnpm release compatible with Node 24

## ADR-005: Bundler

- Decision: esbuild via scripts/build.mjs
- Rationale: Barebone, transparent, no framework magic

## ADR-006: Test runner

- Decision: Vitest + @vitest/coverage-v8 + jsdom
- Rationale: First-class TypeScript + coverage thresholds that fail the build

## ADR-007: Lint/format

- Decision: ESLint 10 (flat config) + Prettier + jscpd
- Rationale: Enforces style and the "no duplicated code" rule

## ADR-008: Git hooks

- Decision: husky + lint-staged
- Rationale: Enforces "not done until verify passes" locally

## ADR-009: CI/CD

- Decision: GitHub Actions (repo: github.com/RazMake/AwesomeAdo)
- Rationale: Matches the remote; store secrets in protected GitHub environment

## ADR-010: Store publishing

- Decision: chrome-webstore-upload-cli v4 + Edge Add-ons API v1.1, gated on complete secret sets
- Rationale: Automated official releases with guarded manual replay

## ADR-011: Version scheme

- Decision: Major.Minor owned by developer; Build = CI run_number - versionBuildOffset
- Rationale: Developer controls breaking changes; CI automates patch increments

## ADR-012: ESLint plugin

- Decision: eslint-plugin-import-x (maintained replacement for eslint-plugin-import)
- Rationale: Allows ESLint 10; original plugin not compatible with ESLint 10

## ADR-013: TypeScript version

- Decision: TypeScript 5.9 (not 7)
- Rationale: typescript-eslint@8.63.0 does not support TypeScript 7

## ADR-014: validate-workflows.mjs helper extraction

- Decision: Extracted `getJobSteps()` helper to eliminate duplicated null-guard + steps access pattern across `getStepIds`, `getStepRuns`, `getStepUses`
- Rationale: jscpd threshold is 0% — even small duplications block the gate

## ADR-015: GitHub workflow schema pin

- Decision: Pinned SchemaStore schema at commit 7c910423, SHA-256 7a952fdb...
- Rationale: Immutable commit pin ensures deterministic validation; hash verified on download

## ADR-016: ESLint preserve-caught-error rule

- Decision: All catch-and-rethrow patterns must include `{ cause: error }` in the new Error constructor
- Rationale: ESLint's `preserve-caught-error` rule is enforced; preserves error chain for debugging

## ADR-017: Shared synced-storage observation helper

- Decision: The race-sensitive "subscribe before reading, revision-guard the initial read" protocol
  lives once in `observeSyncKeys` (`src/common/browser`); both `BrowserSyncSettingsStore` and
  `BrowserSyncQueryBindingStore` delegate to it.
- Rationale: The two stores previously reimplemented the same protocol and had begun to drift. One
  tested implementation removes the drift and gives the logic a single test surface.

## ADR-018: Single source of truth for ADO host matching

- Decision: `AdoHost` (`src/common/navigation`) owns `isSupportedAdoHost`, the `.visualstudio.com`
  suffix, and `ADO_HOST_MATCH_PATTERNS`. The route parser, identity parser, and both tab readers
  derive from it; the manifest globs are pinned to it by `AdoHost.test.ts`.
- Rationale: The "which URLs are ADO" fact was encoded in four independent places (two predicates
  plus the reader globs plus the manifest) that could silently diverge on the security-relevant
  anchored suffix check. The anchored suffix (rejecting `fake.visualstudio.com.evil.com`) must be
  preserved.

## ADR-019: The store owns bindings-map read-modify-write

- Decision: All mutation of the bindings map (`bind`, `unbind`, `setActiveView`) lives in
  `BrowserSyncQueryBindingStore`. Callers forward intent; they never read-modify-write the map
  themselves.
- Rationale: The content script previously re-derived the read-modify-write to toggle a query's
  active view. Centralizing it keeps every mutation in one place and out of the coverage-excluded
  wiring file.

## ADR-020: Host-wide injection with route-gated heavy work

- Decision: The content script is injected on all hosted ADO pages (required to catch SPA navigation
  into Query routes), but every heavy action is gated behind a parsed query id. The only always-on
  cost on a non-query page is two synced-storage observers and one runtime message listener.
- Rationale: Balances the "minimal impact on non-query pages" goal against the MV3 reality that a
  content script cannot be re-injected on in-page SPA navigation. Lazy subscription was considered
  and rejected as higher-risk churn to the correct navigation/blanking flow for negligible savings.

## ADR-021: Source-aware logging via a logger factory

- Decision: Every log line carries the source that wrote it — by convention the emitting class name
  (e.g. `QueryPageController`, `BrowserSyncSettingsStore`), or the runtime context for
  composition-root wiring (`background`, `content`, `options`). `source` is a free-form `string`, not
  a closed union. `ILoggerFactory.forSource(source)` mints a `Logger` that stamps `source` onto each
  `LogEntry` and prefixes `console.error` with `AwesomeADO [source]:`. Composition roots build the
  factory (`createLoggerFactory` / `createLogging`) and hand a per-source `ILogger` to each
  collaborator; the shared stores take the logger as an **optional** constructor argument so an
  absent logger is a no-op and preserves prior behavior.
- Rationale: A single shared log across background/content/options was ambiguous about origin, and a
  fixed five-value union was too coarse — a stack trace named the file but the log named only the
  broad area. Tagging at the factory boundary keeps each class ignorant of its own source string (it
  is injected), satisfies dependency inversion, and lets the Diagnostics view filter by origin. The
  source is passed as an explicit string literal (never `this.constructor.name`) so minification
  cannot rename it. A free-form string means a new class logs without editing any shared registry.
  `LogEntry.source` is optional so entries from a future build carrying an unknown source still
  deserialize; `normalizeLogEntry` also reads the pre-rename `component` key into `source` so buffered
  legacy lines keep their origin after an upgrade.

## ADR-022: Decisions log their signals, not just their outcome

- Decision: State-transition sites log only on a _flip_ and include the participating signals plus
  the conclusion — `QueryPageController` logs enhance/leave-on-ADO with `reason=` and the route,
  configured, queryId, and defaultView signals; `QueryBindingController` logs configuration
  completeness and button/menu appearance changes; the stores log saves by **name only, never
  values** (settings names, `Bound/Unbound/Switched query <id>`). Repeated refreshes that reach the
  same conclusion do not re-log.
- Rationale: The value of a diagnostics log is explaining _why_ the extension did something. Logging
  every refresh would flood the bounded 500-entry ring buffer, so transitions are de-duplicated by
  remembering the last conclusion. Names-only logging keeps the org/team identity out of a log the
  user may export and share.

## ADR-023: Diagnostics source filter and the "View Log" deep link

- Decision: The Diagnostics tab filters by source through a searchable multi-select dropdown
  (`MultiSelectFilter`), not inline checkboxes. The dropdown derives its options dynamically from the
  sources present (unlabeled entries bucket under `(unlabeled)`), stays hidden until at least one
  source exists, and offers a type-to-filter search plus "Select all" / "Clear all" shortcuts. Hidden
  sources live in a `Set` keyed by source that survives re-render, and combine with the errors-only
  toggle via AND. The dropdown closes on outside pointerdown or Escape. The AwesomeADO top-bar menu
  appends a `View Log` footer (separator + item) to **every** menu variant; selecting it deep-links to
  the options page with `?section=diagnostics`, which `optionsPath` builds and `options/index` reads
  to activate the Diagnostics tab.
- Rationale: With sources now tagged per class, a flat checkbox row would not scale — dozens of
  sources overwhelm the toolbar and cannot be scanned. A searchable dropdown lets the user type a
  class name and select one or more, and the summary trigger keeps the toolbar compact. Deriving
  options from data keeps the filter honest and rebuilds the list only when the distinct set changes.
  `MultiSelectFilter` is a generic options-page widget (no logging knowledge) so it can be reused for
  future filters. Routing the deep link through a typed `OptionsSection` (validated by
  `isOptionsSection`) keeps the query parameter contract in one place shared by the message sender and
  the options reader.

## ADR-024: Options tab reuse and in-place section reveal

- Decision: The background service worker reuses an already-open options tab instead of always
  calling `chrome.tabs.create`. It remembers the id of the last options tab it opened in an
  in-memory `lastOpenedOptionsTabId`; on a subsequent open it focuses that tab
  (`chrome.tabs.update({active:true})` + `chrome.windows.update({focused:true})`) and, when a
  section is requested, posts a typed `REVEAL_OPTIONS_SECTION_MESSAGE` that the already-loaded
  options page handles by activating the section's tab **in place** (no reload). If focusing throws
  (tab was closed) it clears the id and falls back to `chrome.tabs.create`. The load-time deep link
  (`?section=`) and the live reveal both resolve the tab element id through one shared
  `sectionTabId(section)` map so the two paths cannot drift.
- Rationale: `chrome.tabs.create` never dedupes, so repeated menu use (Options, then View Log)
  stacked duplicate options tabs and — worse — a duplicate could open on the default Appearance tab,
  making "View Log always shows Diagnostics" unreliable when options was already open. Reuse + live
  reveal guarantees the requested section is shown and preserves any in-progress edits in the open
  tab. Tracking the tab id in memory (rather than `chrome.tabs.query({url})`) deliberately avoids
  needing the `"tabs"` permission; the id is forgotten on service-worker recycle, which only costs a
  one-time fallback to opening a fresh tab.

## ADR-025: Per-class log sources replace the five-value component union

- Decision: The log tag was renamed `component` → `source` and the fixed `LogComponent` union
  (`background`, `content`, `options`, `settings`, `bindings`) was deleted in favor of a free-form
  string that, by convention, is the emitting class name. `ILoggerFactory.forComponent` became
  `forSource`; each composition root now passes a class-name literal per collaborator. The Diagnostics
  filter moved from an inline checkbox row to a searchable multi-select dropdown (`MultiSelectFilter`,
  a generic options-page widget). `normalizeLogEntry` keeps reading the legacy `component` key into
  `source`.
- Rationale: The five-area union was too coarse to answer "which class did this?" and clashed with
  AGENTS.md §7 (a "component" is a feature area, not a class). A closed union also forced every new
  class to edit `LogComponent.ts` just to log. A free-form string, passed as a literal so minification
  cannot rename it, removes that coupling. Because per-class tagging can produce many sources, the
  flat checkbox row was replaced with a searchable, select-all/clear-all dropdown so the filter stays
  usable at scale.

## ADR-026: Component subfolders in `content`/`options` and folder-path log sources

- Decision: `src/content/` and `src/options/` are split into cohesive component subfolders, mirroring
  `src/common/` — `content/{ado-probe,query-binding,query-page}` and
  `options/{appearance,ado-config,query-bindings,diagnostics,alerts,shell}` — and each subfolder
  carries its own usage `README.md`. Only the composition-root `index.ts` (and `options.html`) stay at
  the folder root. The log `source` convention (ADR-021/ADR-025) is refined from the emitting class
  name to the **component folder that owns the emitting code**, expressed as the `src/`-relative path
  with forward slashes: e.g. `content/query-page`, `content/query-binding`, `common/settings`,
  `common/bindings`, `options/alerts`. Composition-root wiring not tied to one subfolder keeps the
  runtime-context source (`background`, `content`, `options`). `source` remains a free-form string
  (still a literal, never `this.constructor.name`), so this is a naming-convention change only — no
  code in `Logger`/`LoggerFactory`/`LogEntry` changed.
- Rationale: Flat `content`/`options` folders left those two areas as single, over-broad log buckets
  while every other area was already a folder-scoped component; AGENTS.md §7 defines a component as a
  feature-area folder, so making the log source the owning folder makes the whole tree consistent and
  the Diagnostics filter groups lines by the same feature areas the code is organized into. Folder
  paths (rather than bare leaf names) keep sources unambiguous when two areas share a leaf name and
  read naturally in the source filter. `index.ts` stays at the root so the build entry points
  (`src/content/index.ts`, `src/options/index.ts`) and the coverage `src/**/index.ts` exclusion are
  unaffected by the move.

## ADR-027: Views live under `content/`; options may import only the view config catalog

- Decision: Enhanced views moved from `src/common/views/**` to `src/content/views/**`, keeping each
  view whole in one folder (`content/views/<view>/` holds both `<view>ViewType.ts` config and
  `<view>View.ts` renderer). The two abstract contracts (`ViewType`, `EnhancedView`) moved to
  `src/common/view-common/` so both bundles depend on the abstraction, not each other. This creates
  one **scoped, enforced exception to AGENTS.md §6**: `src/options/**` is allowed to import exactly
  one content module — `content/views/viewCatalog` (the view **config** list needed to build the
  binding form) — and nothing else from `content/`. The exception is welded shut by an
  `import-x/no-restricted-paths` zone in `eslint.config.js` (target `./src/options`, from
  `./src/content`, `except` only `./views/viewCatalog.ts`); any other options→content import fails
  lint/CI. A `*ViewType.ts` config must never import its `*View.ts` renderer, so `viewCatalog` pulls
  in no renderer DOM and the options bundle stays DOM-free.
- Rationale: A view _is_ content (the surface painted in place of ADO's page), so `common/` was the
  wrong home; but the options binding form genuinely needs each view's configurable properties, and
  keeping each view in a single folder is far more readable than splitting config and renderer across
  two trees. §6 explicitly permits an override via a recorded ADR, so rather than either relocating
  config away from its renderer or letting options reach broadly into content, the break is reduced to
  a single lint-enforced doorway. Pure contracts in `common/view-common` are ordinary Dependency
  Inversion (§5-D), not a §6 exception. This does not open general options→content coupling: the
  linter blocks every path except the one catalog module.

## ADR-028: Credentialed ADO REST runs through a MAIN-world bridge with a closed op-set

- Decision: All credentialed Azure DevOps REST access from an enhanced view goes through a manifest
  `world:"MAIN"` bridge content script that owns the fetcher, because a content script (isolated
  world) cannot call `chrome.scripting`. The isolated content script and the bridge exchange messages
  guarded by a **per-session nonce** plus strict `event.origin` **and** `event.source` checks, and the
  bridge exposes a **closed operation vocabulary** (read/set item props, read/add/update comment,
  reorder, …) — never a generic "fetch any URL" proxy. Responses are returned only to us; field values
  and identity are never logged.
- Rationale: The only credentialed path available to a content script is a MAIN-world fetch, and MAIN
  world shares the page's DOM with a potentially hostile ADO or injected script. A generic proxy would
  let any page on the origin exfiltrate through our authenticated session, so the surface is reduced to
  a fixed op-set behind an authenticated, origin/source-checked channel. Recorded as principle #2 in
  systemPatterns "Enhanced View Runtime Principles".

## ADR-029: The ADO server is the only source of truth (no live in-page shared state)

- Decision: An enhanced view and ADO's own grid are treated as **two independent, eventually-consistent
  caches of the ADO server**, with no live shared in-page state between them. The earlier idea of a
  shared in-page data layer (originally "principle 3") is dropped as unachievable.
- Rationale: The two sides run in different JS worlds (isolated vs. MAIN) and never share a heap, so
  there is no reachable shared source of truth in the page; all coupling must flow through the server.
  Designing around a shared cache would be unimplementable and would mask staleness. Refresh on mount /
  manual / after the write queue drains (no background polling) plus per-item `System.Rev` tracking keep
  each side convergent. Recorded as principles #1 and #3 in systemPatterns.

## ADR-030: Fluid optimistic writes via a per-tab sequential queue

- Decision: View edits are **optimistic**: a change updates the in-memory model immediately and enqueues
  a write onto a **per-tab, strictly-sequential** queue (two tabs on the same query keep separate
  queues). The queue coalesces rapid ops on the same target, **reads back** changed properties after
  each committed write to reconcile server-side rule effects, tracks `System.Rev` for optimistic
  concurrency, and backs a **single-level, in-memory undo stack per query**. Failures roll back the
  optimistic UI and surface in a themed top panel: transient errors (network/5xx/timeout) auto-retry
  with backoff then surface; 409/412 stale-rev roll back with **no auto-rebase**; 403/404 surface
  immediately. Pending writes block view-switching and raise a themed unload / SPA-nav-away guard.
- Rationale: ADO writes are latency-bound and rule-driven; blocking the UI per write would feel
  sluggish, while firing writes concurrently would race on `Rev` and on reorder. A sequential per-tab
  queue keeps ordering deterministic and undo reasoning single-level, and read-back reconciliation plus
  no-auto-rebase avoid silently overwriting a concurrent change. Recorded as principles #5–#8 in
  systemPatterns.

## ADR-031: Tab-local view override with fixed precedence

- Decision: The per-query "which view is showing" choice is a **tab-local override** kept in the ADO
  page's `sessionStorage`, with fixed precedence **override › per-query configured default (synced) ›
  global default**. The frequent menu toggle writes **only** the tab-local override (survives F5, never
  syncs); a separate explicit **"make this my default"** action writes the synced per-query default,
  effective only on the next navigation to the query. Menu checkmarks reflect the **effective** view.
  Flipping **to** ADO's standard grid may reload — gated by a per-query in-memory **freshness token**
  (bumped by committed writes and by reads that observe a new `id:rev` set) so a reload happens only
  when the data actually advanced; flipping back to the enhanced view refreshes in place.
- Rationale: Users flip a single query between enhanced and standard frequently and per-tab, but that
  transient choice must not overwrite their synced default or leak to other tabs and devices; a
  session-scoped override that outranks the synced default gives a durable-within-tab toggle plus an
  explicit opt-in to change the real default. Reloading on every flip-to-standard would be jarring, so
  the freshness token restricts the reload to the case where ADO genuinely needs to re-fetch. Recorded
  as principle #9 in systemPatterns.
