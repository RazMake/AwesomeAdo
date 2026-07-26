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
  lives once in `observeStorageKeys` (`src/common/browser`); both `BrowserSyncSettingsStore` and
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

## ADR-028: Credentialed ADO REST runs through the background worker with a closed op-set

> **Amended.** The original decision described a manifest `world:"MAIN"` **bridge content script**
> exchanging nonce-guarded, `event.origin`/`event.source`-checked `postMessage`s. That design was
> never built. Auditing against the old text would credit controls that do not exist, and
> implementing against it would build the weaker design, so the Decision below now describes what
> actually ships.

- Decision: All credentialed Azure DevOps REST access from an enhanced view goes through the
  **background service worker**, which is the only context that can call `chrome.scripting`. The
  content script sends a typed message; the worker injects a self-contained fetcher into the ADO
  tab's MAIN world with `chrome.scripting.executeScript({ world: "MAIN" })` and hands the raw body
  back for parsing. There is **no page-reachable message channel at all** — no `postMessage` bridge,
  and no `externally_connectable` in the manifest — so no nonce or origin/source check is applicable;
  the sender is necessarily the extension's own content script. The worker exposes a **closed
  operation vocabulary** (load a query's tree, load a team's iterations, reconcile the Feature Crew
  roster, update one work item field) and never a generic "fetch any URL" proxy: every request URL is
  built from the **sender's own tab URL**, which must parse as a supported ADO location
  (`AdoHost`), and never from a value in the message. The field-update op additionally requires an
  ADO field **reference-name shape** and roots its JSON Patch at `/fields/`, so it cannot address
  `/rev` or `/relations`. Values the MAIN world returns are shape-checked before use, because the
  page — not the extension — owns the globals that produced them. Field values and identity are never
  logged.
- Rationale: The only credentialed path available is a MAIN-world fetch, and MAIN world shares the
  page's realm with a potentially hostile ADO page. Removing the page-reachable channel entirely is
  strictly stronger than guarding one, and reducing the surface to a fixed op-set whose targets are
  derived from the sender's own tab means the extension can never be used to reach an origin, a
  collection, or a resource the calling page could not already reach with its own session. Recorded
  as principle #2 in systemPatterns "Enhanced View Runtime Principles".
- Known residual: the content script's own UI (the top-bar button and its menu) lives in the page's
  DOM, so page script can dispatch a synthetic click on it. The usual mitigation is an
  `Event.isTrusted` check, which is **not** implemented: `isTrusted` is `[LegacyUnforgeable]`, so
  jsdom cannot produce a trusted event and the guard would be untestable while disabling every
  existing behaviour test. The reachable impact is bounded — bindings are keyed by an unguessable
  query GUID, so a synthetic "Disable Enhanced View" can only unbind a GUID the attacker already
  knows — and the remaining surface is an unsolicited options tab carrying attacker-chosen text.
  Revisit if the suite ever gains a real-browser runner.

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

> **Status: partially implemented.** What ships is the sequential queue, `System.Rev` optimistic
> concurrency with the rev bound at **execution** time, a live pending count, and a user-visible
> failure state. What does **not** ship: coalescing, read-back reconciliation, the undo stack,
> auto-retry with backoff, differentiated 403/404/409/412 handling, view-switch blocking, and the
> unload / SPA-nav-away guard. Those remain design intent, not as-built behaviour. Note also that the
> shipped controls are **persist-then-reflect**, not optimistic: a badge only moves once the write
> commits, so there is nothing to roll back — the failure is reported instead.

- Decision: View edits enqueue a write onto a **per-tab, strictly-sequential** queue (two tabs on the
  same query keep separate queues). The queue coalesces rapid ops on the same target, **reads back**
  changed properties after each committed write to reconcile server-side rule effects, tracks
  `System.Rev` for optimistic concurrency, and backs a **single-level, in-memory undo stack per
  query**. Failures roll back the optimistic UI and surface in a themed top panel: transient errors
  (network/5xx/timeout) auto-retry with backoff then surface; 409/412 stale-rev roll back with **no
  auto-rebase**; 403/404 surface immediately. Pending writes block view-switching and raise a themed
  unload / SPA-nav-away guard.
- Rationale: ADO writes are latency-bound and rule-driven; blocking the UI per write would feel
  sluggish, while firing writes concurrently would race on `Rev` and on reorder. A sequential per-tab
  queue keeps ordering deterministic and undo reasoning single-level, and read-back reconciliation plus
  no-auto-rebase avoid silently overwriting a concurrent change. Recorded as principles #5–#8 in
  systemPatterns.
- Amendment (rev binding): serialization alone does **not** deliver the stated goal. A queued write
  originally captured `rev` when the user clicked, so a second edit to the same item inside the write
  latency window carried a pre-commit rev and was rejected by the `/rev` test — a silently discarded
  edit. The queue now takes a `currentRev` **resolver** and evaluates it inside `perform()`, after the
  previous write has settled and committed its new rev onto the item. The item stays the single owner
  of its rev; the queue keeps no shadow copy to drift.
- Amendment (failure channel): every editable control is persist-then-reflect, so a rejected write
  left the screen unchanged and was indistinguishable from a slow one. `FieldWriteQueue` now exposes
  `onWriteFailed` as a second, narrow subscription (deliberately not a widening of the pending-count
  callback), and the board's write-status control renders "Couldn't save N change(s)".

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

## ADR-032: Data-driven views consume injected `EnhancedViewServices`; the tree loader is a placeholder pending the MAIN-world bridge

> **Corrected.** The member list below was written before the bag grew. The shipped
> `EnhancedViewServices` is `loadTree`, `userDirectory`, `getTypes`, `getBoardColumns`,
> `loadSprintWindow`, `now`, `logger`, `featureCrew`, `writeField` — there is no `getSprints`. The
> shared DOM controls moved from `content/views/shared` (which no longer exists) to
> `common/view-common/control/**`.

- Decision: A data-driven enhanced view depends only on an injected `EnhancedViewServices` abstraction
  added as an **optional** field on `EnhancedViewContext`; `EnhancedViewSurface` receives the services
  once at the content composition
  root and forwards them per render. The normalized tree model (`TrackedWorkItem`/`TrackedUser`/
  `TypeCatalogEntry`/`SprintRef`) and the loader/directory contracts (`IWorkItemTreeLoader`,
  `IUserDirectory`) live in `common/ado`; view-facing UX helpers — PST date formatting + ETA countdown
  (`common/datetime`) and the shared DOM controls `DateLabel`/`EtaBadge`/`AssignedTo` — are reused by
  every view. The Project Tracking view renders a single-root
  tree board against this model and validates its binding (tree query, exactly one root, root is the
  first configured type). The composition-root `loadTree` is today a **clearly-labeled placeholder**
  returning a "coming soon" message; the real credentialed fetch is the follow-up under ADR-028.
- Rationale: Building the full secure MAIN-world tree-query bridge (ADR-028) at the same time as the UI
  would couple two large, independently riskier efforts. Injecting the data behind an abstraction lets
  the whole board UI be built and fully unit-tested with deterministic fakes now (coverage ≥ 85%,
  composition root excluded), keeps Dependency Inversion intact, and leaves a single wiring seam to swap
  the placeholder loader for the live bridge without touching any view. `services` is optional so the
  remaining placeholder views and their tests keep compiling unchanged. **Superseded in part by ADR-033**,
  which replaced the placeholder `loadTree` with the live MAIN-world bridge at that same seam.
- Amendment (optionality): the optional field's cost landed entirely in the consumer. In production
  `services` is never absent — the content composition root always supplies it — so every downstream
  `if (context.services)` was a branch that existed only for tests, and the one inconvenient site was
  bypassed with a non-null assertion: the same file simultaneously claimed services could be missing
  and asserted they were not. `services` stays optional on `EnhancedViewContext` (placeholder views
  such as `SprintView` genuinely need nothing), but `common/view-common` now also exports
  `DataDrivenViewContext = EnhancedViewContext & { services: EnhancedViewServices }`. A data-driven
  view checks once at its entry point and every helper below takes the narrowed type, so no helper
  re-checks and none can reach for an assertion. Rejected alternative: a `DataDrivenEnhancedView`
  interface the registry narrows — `render` is declared with method shorthand, so its parameters are
  checked **bivariantly** even under `strict`, and the compiler would catch nothing.

## ADR-033: Project Tracking loads live via a content→background→MAIN-world tree-fetch bridge

- Decision: The composition-root `loadTree` placeholder (ADR-032) is replaced by a real bridge, split so
  each piece stays testable and the ADR-028 security posture holds:
  - `common/ado/fetchAdoTree.ts` (pure, chrome-free): `buildAdoTreeUrls(href, queryId)` builds the
    `_apis/wit/wiql/{id}` + `_apis/wit/workitemsbatch` URLs (reusing the shared
    `resolveAdoProjectContext` helper extracted from `buildAdoMetadataUrls` to satisfy jscpd), and
    `parseTrackedTree(raw, etaFieldByType)` normalizes the raw WIQL relations + batch items into the
    `TrackedWorkItem` tree (roots = relations with `source === null`; cycle/depth-guarded).
  - `common/browser/fetchAdoTreeInPage.ts`: the self-contained MAIN-world fetcher (like
    `fetchAdoRawInPage`) the background worker injects — runs the WIQL query, collects the work-item
    ids, pages `workitemsbatch` (200/page), and returns the raw `{ wiql, items }`.
  - `common/browser/AdoTreeRequest.ts`: the `LOAD_QUERY_TREE_MESSAGE` content→background contract
    (`{ queryId, fields }` → `{ raw }`) with its guard.
  - `common/browser/MessagingWorkItemTreeLoader.ts`: the browser-agnostic `IWorkItemTreeLoader` the
    view depends on; an injected `SendTreeRequest` (bound to `chrome.runtime.sendMessage` at the content
    root) carries the request, and the reply is parsed with `parseTrackedTree`. Every failure path logs
    and returns an error result — it never throws.
  - Composition roots (excluded from coverage): the content root instantiates the loader and rebuilds
    the per-type ETA-field map from the latest synced settings; the background worker handles the
    message by building the URLs **from the sender's own trusted tab URL** and running the MAIN-world
    fetch.
- Rationale: A content script's isolated world cannot reach the credentialed ADO REST API (CORS-blocked;
  an extension-page same-origin fetch drops ADO's SameSite session), so the fetch must run in the ADO
  tab's MAIN world — which only the background worker can inject (ADR-028). Building the request URLs in
  the worker from the trusted `sender.tab.url` (never from a content-supplied URL) keeps this a closed
  "load this query's tree" operation, not a fetch-any-URL proxy. Splitting the pure URL/parse layer from
  the injected fetcher, the message contract, and the agnostic loader keeps each unit-testable with
  deterministic fakes while the only untested code stays in the excluded composition roots. Fixed two
  latent bugs in the pre-existing parse layer surfaced by its own tests: `parseTrackedTree` now reports a
  missing (`null`) WIQL body as a load error (checked before the queryType branch), and `htmlToText`
  decodes entities before stripping tags so entity-encoded markup does not survive as visible text.

## ADR-034: Every enhanced-view control follows the ADO theme

- Decision: Every UI control an enhanced view renders (badges, pills, buttons, twisties, dropdowns,
  popups, panels, the work-item status control, the sprint picker, expand/collapse affordances) MUST
  follow the account's active ADO theme (light / dark / blue / high-contrast). Controls style from ADO's
  theme CSS custom properties with a hard literal fallback — never a bare literal color as the only
  value: surfaces use `var(--callout-background-color, var(--background-color, #fff))`, text uses
  `var(--text-primary-color, …)` / `var(--text-secondary-color, …)`, and borders/separators use a
  neutral token (`var(--palette-neutral-20, …)` /
  `var(--component-menu-separator-color, rgba(128,128,128,0.35))`), mirroring `BindingMenu`,
  `AssignedTo`, and `EnhancedViewSurface`. A control that encodes a status/state color renders it
  **muted/discrete** (a low-alpha tint over the themed surface, not a solid fill) so it reads on any
  theme; decorative guides (e.g. the child-indent line) use a discrete theme-derived neutral. Reusable
  theme-aware controls live under `src/common/view-common/control/<Control>/` (the sole DOM allowed
  under `common/`, per AGENTS.md §11) so every view shares one correctly-themed implementation.
- Rationale: Hard-coded light-only palettes (`#fff` fills, `#333`/`#666` text, `#ddd`-only borders) are
  invisible or jarring on the dark theme — the earlier Project Tracking board shipped several. Sourcing
  from ADO's own theme tokens with fallbacks makes each control track whatever theme the account paints,
  with no theme-detection code in the control. Muted status tints keep the state hue legible without a
  solid block of color fighting the page on any theme. Recorded as principle #13 in systemPatterns and
  enforced as a standing review gate (a control that hard-codes non-theme colors is a defect).

## ADR-035: Project Tracking renders two child levels and rolls the rest into `ChildItemsBadge`

- Decision: The Project Tracking tree renders at most **two levels below the root** (`MAX_ROW_DEPTH = 1`
  in `ProjectTrackingView`: the root's children at depth 0, theirs at depth 1). A row at the last
  rendered level gets **no twisty**; its children are summarized inline by the shared
  `common/view-common/control/ChildItemsBadge` control as a `completed / total` chip whose popup lists
  one row per child (`{AssignedTo} {title} {ETA} {type icon -> ADO}`). "Completed" is the
  **last board column before Removed** (`COMPLETED_COLUMN_FROM_END = 2` against the fixed five-column
  list), so an abandoned child never counts as done. The chip's tint derives from the **last configured
  work item type's** color via the control's `color` option, kept discrete per ADR-034. The rollup runs
  its children through the same `isVisibleUnderFilter` predicate as the tree, so its count always agrees
  with the active sprint/tag filters.
- Rationale: A four-plus-level tree scrolls off the screen and buries the level people actually manage.
  Capping the rows keeps the board scannable while the rollup keeps the leaf work **countable and
  reachable** rather than hidden. `ChildItemsBadge` already existed (built, tested, documented, but
  unwired) for exactly this shape, so it was extended rather than duplicated — it gained a caller-supplied
  `eta` element per child and a `color` tint source. The ETA element is **built by the caller**
  (`describeMinorChild` calls the view's own `createItemEtaBadge`) so a rolled-up ETA edits and persists
  through the board's shared `FieldWriteQueue` exactly like a tree row, without the shared control taking
  a dependency on ADO write plumbing. Per-render tree invariants were bundled into one
  `TreeRenderOptions` object because the renderer parameter lists had already reached 11-14 arguments.
- Consequence: `common/ado/fetchAdoTree` gained `buildWorkItemUrl(href, id)` — the **web** deep link
  (`{base}/{project}/_workitems/edit/{id}`), distinct from the REST `buildWorkItemUpdateUrl`.

## ADR-036: One storage-observation implementation, with no revision guard

- Decision: `common/browser/observeStorageKeys` (renamed from `observeSyncKeys`) is typed against the
  shared `IBrowserKeyValueStorage` contract and is the **only** implementation of the
  subscribe-before-read protocol. `BrowserLocalLogStore.observe` delegates to it instead of keeping a
  hand-written copy. The revision counter is deleted: the post-read snapshot is emitted
  unconditionally, and freshness is guaranteed solely by the read refusing to fill a key the live
  subscription has already recorded.
- Rationale: The module documented itself as the reason two stores "cannot silently drift on this
  logic", while a third store had already re-implemented the whole protocol by hand — including its
  defect. The duplication was possible only because of a naming and typing illusion:
  `IBrowserSyncStorage` and `IBrowserLocalStorage` are both aliases of `IBrowserKeyValueStorage`, so
  the helper was always reusable and only the word "Sync" in its name suggested otherwise. Neither
  the type system, the linter, nor jscpd could see the drift, so the single-source-of-truth claim was
  held up by a comment.
- The revision guard was also wrong, not merely redundant. It gated a **multi-key** projection on a
  **global** counter: when any key changed during the initial read, the complete post-read snapshot
  was suppressed — but the change-driven emit that "replaced" it fired before the reads had filled in
  the _other_ keys, so every one of them was projected at its default and stayed there for the life
  of the tab. The `if (!(key in raw))` check already delivers the intended invariant on its own, so
  removing the counter makes the second emit at worst an idempotent duplicate.

## ADR-037: Reconcile decision logic lives outside the background composition root

- Decision: A composition root may construct concrete browser-backed collaborators and register them
  with browser event APIs. It may **not** own a named symbol that branches on data, enforces a
  security precondition, or holds mutable state across events. `reconcileFeatureCrewRoster`,
  `buildFeatureCrewApplyConfig` and the MAIN-world result shape check moved out of
  `src/background/index.ts` into `common/ado/reconcileFeatureCrew.ts`, with tests. The shared
  `ADO_API_VERSION` moved to `common/ado/adoApi.ts` so the update URL cannot target a different API
  version than the create URL beside it.
- Rationale: `src/**/index.ts` is excluded from the coverage gate on the stated grounds that a
  composition root is wiring. That premise had stopped describing the background worker, which had
  accumulated the create-vs-update branch, the roster merge that decides whether a developer's
  hand-edited tags get overwritten, and a hand-built `?api-version=7.1` duplicating a constant
  `common/ado` already owned — all in the one file both coverage and jscpd are blind to.
- Explicitly **not** done: removing `src/background/index.ts` from the exclusion list. The file
  performs privileged side effects at module scope (`chrome.webNavigation` and five
  `chrome.runtime.onMessage` registrations), so importing it under jsdom without a full `chrome` fake
  is not possible; un-excluding it would add ~20 uncovered functions and turn the gate red without
  making one line more tested. Extracting the decisions is what actually raises coverage.
- MAIN-world results are shape-checked rather than cast. The injected functions run in the ADO page's
  own realm, so the page controls the globals that produce their return values, and the Feature Crew
  lookup's `id` is concatenated into a credentialed request URL. `firstScriptResult` now returns
  `unknown` so a caller cannot accidentally inherit a type nobody verified.

## ADR-038: The assignee picker is suggestion-first, and reassignment is a normal field write

- Decision: `AssignedTo` offers a caller-supplied `suggestions()` list the instant it opens, filters
  it locally as the user types, and only asks `IUserDirectory` from `MIN_IDENTITY_SEARCH_LENGTH`
  characters up (directory matches are appended **below** the suggestions). Project Tracking supplies
  the suggestions by walking the live tree (`collectAssignedDirectoryUsers`) on each open. Picking a
  person enqueues an ordinary `System.AssignedTo` write on the board's shared `FieldWriteQueue`, and
  the chip repaints only on success via a new `AssignedToHandle.setUser` — persist-then-reflect, the
  same contract `StatusBadge` and `EtaBadge` already use.
- Rationale: the picker previously opened empty and searched an unimplemented directory, so it could
  never offer anybody, and a pick only touched the Feature Crew roster — the work item kept its old
  owner. Suggestion-first makes the overwhelmingly common case (reassigning within the project) cost
  no network round-trip at all, which is what makes the control feel as light as the other write
  controls; the directory search is the escape hatch for everyone else.
- The live directory is `MessagingUserDirectory` over the same content→background→MAIN-world bridge as
  the tree, iterations and Feature Crew reads (ADR-033), targeting the org-scoped **Identity Picker**
  endpoint — the one ADO's own people picker calls, so it resolves anyone assignable rather than only
  one configured team's members. It is pinned to `5.0-preview.1` (that endpoint never graduated out
  of preview) rather than the shared `ADO_API_VERSION`. Answered queries are cached for the
  directory's lifetime so backspacing over a name is free.
- `ChildItemsBadge` no longer builds assignee controls: like the ETA slot, the owning view passes a
  prebuilt `assignee` element. A control that renders a write affordance must not also own which
  item, field and queue that write goes to.
- The reconcile after a pick now runs even when the person was already on the roster. It is the
  reconcile that hands back their crew tag, and without it a reassignment left the chip wearing the
  neutral "??" pill; nothing is written when nothing changed.

## ADR-039: The in-view ordering pick is board-local; the binding stays the default

- Decision: the Project Tracking header carries a discrete `OrderingPicker` (a sort glyph in the
  tile's top-right corner, `common/view-common/control/OrderingPicker`) offering the same
  `ORDERING_POLICIES` the binding form offers. The board owns the live policy (`createOrderingControl`)
  and `renderTreeContent` reads it through a getter, so a pick re-sorts the loaded items on the spot.
  The pick is **not** written back to the binding.
- Rationale: persisting it would write to synced storage, come back through the bindings observer,
  change `EnhancedViewSurface`'s request signature and rebuild the whole view — a fresh ADO tree read
  and every expanded item collapsed, to re-show items nobody re-fetched. That is the opposite of an
  instant re-sort. The same reasoning already keeps the sprint filter, the tag filter, and the active
  view (ADR-031) in-session; the binding's `orderingPolicy` keeps deciding the order every board
  opens on, and remains the single persisted source of truth.
- Consequence: a view that renders items must read its ordering from live board state, never
  re-derive it from `context.properties` inside a render pass, or a picked order silently reverts on
  the next repaint (a roster reconcile, a tag change, a sprint toggle).

## ADR-040: A move is not a field write — it gets its own contract, and rides the same queue

- Decision: drag-to-reorder is persisted through a **separate** contract, `IWorkItemReorderWriter`
  (`common/ado/IWorkItemReorderWriter`), wired as `EnhancedViewServices.reorderItem` beside
  `writeField`. Position is expressed as the two siblings the item lands **between** (`previousId`/
  `nextId`, with `0` as ADO's start/end/no-parent sentinel) plus its `parentId` — never as a rank.
  The background worker runs two MAIN-world calls in order: re-point the
  `System.LinkTypes.Hierarchy-Reverse` link under a `/rev` test (skipped when the parent is
  unchanged), then PATCH the team-scoped `_apis/work/workitemsorder` endpoint.
- Rationale: a re-parent changes the item's **links** and its rank lives behind a team-scoped backlog
  endpoint, so neither is a `/fields/` patch — folding it into `IWorkItemFieldWriter` would have
  widened a deliberately closed "update one field on one item" operation into one that can
  restructure a tree (Interface Segregation). Naming neighbours instead of computing a rank leaves
  the arithmetic to ADO, which already renumbers a level when no gap is left; two clients computing
  their own ranks against a stale board would collide. The link is moved first so a rejected
  re-parent leaves **both** the tree and the rank untouched.
- Consequence: `FieldWriteQueue` became `WorkItemWriteQueue` and gained `enqueueReorder`. The queue
  is shared rather than duplicated because a re-parent patches the same item under the same `/rev`
  test a field write does — two queues would race exactly where serialization matters most — and
  because the board's one "Saving…" indicator must cover moves too.
- Consequence: `workitemsorder` has never left preview, so its api-version is pinned locally
  (`WORK_ITEMS_ORDER_API_VERSION`) instead of dragging the shared `ADO_API_VERSION` onto a preview
  contract.

## ADR-041: Drag-to-reorder is depth-fixed, importance-only, and ranked against unfiltered siblings

- Decision: a row may only be dropped at the depth it came from; the ordering glyph is the status
  light that says when dragging is unavailable (heavily-transparent red plus the reason in its
  tooltip); the affordance exists only under `MANUAL_ORDERING_POLICY` and only when a team is
  configured; and `previousId`/`nextId` are computed from the level's **full** sibling list, not the
  rows the active sprint/tag filters leave on screen.
- Rationale: depth-fixed keeps a parent from becoming a peer's child by accident while still allowing
  a leaf to move between parents at its own level. Under a derived policy (title, ETA) a dropped row
  would be re-sorted straight back out of its slot, so offering the handle would be a lie — and
  backlog rank is per-team in ADO, so without a team a move would rank against a guess. Ranking
  against only the visible rows would place the item relative to whatever the filter happened to
  leave, so clearing the filter would reveal it somewhere the user never dropped it.
- Consequence: the tree renderer takes the **parent item** rather than a bare list, because a level's
  identity (which item a dropped row becomes a child of, plus its full sibling order) is what a drag
  needs and a list alone cannot supply.
- Consequence: the move is persist-then-reflect like every other control on the board — the tree is
  not touched until ADO accepts it — so there is no rollback path to get wrong.
