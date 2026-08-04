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
- Amendment (one licensed rebase): "no auto-rebase" assumed a stale rev means a concurrent edit. It
  usually does not. A drag-reorder, the ADR-042 rank fallback and a note posted through the comments
  API all advance `System.Rev` **without reporting the new value**, so the board's cached rev goes
  stale by itself and every later write on that item is refused with `HTTP 412` until the board is
  reloaded — which made the marker-tag command unusable after any drag. A field write may now carry
  `baseValue`, the value the change was DERIVED from; on a 412/409 the injected patch re-reads the
  item and retries once against the server's rev **only while the field still holds that value**. A
  field that actually moved is still reported as a conflict and never overwritten, which is the case
  "no auto-rebase" was written for; the rebase is bounded to one attempt so a moving item cannot spin
  the write.

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

## ADR-034: Every enhanced-view control follows the selected AwesomeADO theme

- Decision: Every UI control an enhanced view renders (badges, pills, buttons, twisties, dropdowns,
  popups, panels, the work-item status control, the sprint picker, expand/collapse affordances) MUST
  follow one of three concrete AwesomeADO themes: Dark, Light, or Blue. `Follow Azure DevOps` is a
  preference, not a fourth theme: it detects ADO's polarity and resolves only to Dark or Light; Blue
  is manual. Each complete palette lives in its own `common/view-common/themes/<name>Theme.ts` module
  and never imports or extends another theme. One registry derives the setting type and accepted
  values, populates the options selector, and supplies the palette used by both options and enhanced
  views. Every fixed presentation and semantic color is a role in the complete contract; consumers
  use no literal color fallback. ADO/data-derived hues remain runtime inputs, with fixed blend
  endpoints and framing supplied by the theme. Semantic status colors remain muted/discrete, and
  reusable controls remain under `view-common/control`.
- Rationale: Hard-coded light-only palettes (`#fff` fills, `#333`/`#666` text, `#ddd`-only borders) are
  invisible or jarring on the dark theme. A complete shared variable contract keeps every control
  coherent, while standalone definitions prevent a new theme from changing or inheriting hidden
  assumptions from an existing one. Resolving Follow ADO at the boundary preserves automatic
  dark/light behavior without coupling controls to Azure DevOps' palette or high-contrast variants.

## ADR-035: Project Tracking renders two child levels and rolls the rest into `ChildItemsBadge`

> **Superseded in part by ADR-058.** Two levels remain only as the compatibility fallback for
> configurations with no Primary-work classification. Classified hierarchies use the delivery
> boundary described by ADR-058.

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
  `System.LinkTypes.Hierarchy-Reverse` link under a `/rev` test and apply any destination type in the
  same JSON Patch (skipped when the parent is unchanged), then PATCH the team-scoped
  `_apis/work/workitemsorder` endpoint.
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

## ADR-041: Drag-to-reorder supports adjacent levels and ranks against unfiltered siblings

- Decision: a tree row or rolled-up child popup row may stay at its depth or move one adjacent level.
  Dropping a child between rows one level above promotes it under their parent; dropping a leaf among
  rows one level below demotes it under their parent at the targeted position. A source with children
  cannot be demoted. Any changed parent requires its configured default child type, written in the
  same `/rev`-guarded JSON Patch as the hierarchy link. Same-parent and changed-parent drops use
  distinct themed marker roles. A popup closes when its drag reaches a legal external target. The ordering glyph is the status
  light that says when dragging is unavailable (heavily-transparent red plus the reason in its
  tooltip); the affordance exists only under `MANUAL_ORDERING_POLICY` and only when a team is
  configured; and `previousId`/`nextId` are computed from the level's **full** sibling list, not the
  rows the active sprint/tag filters leave on screen.
- Rationale: limiting hierarchy changes to one level and allowing only leaf demotion prevents an
  implicit subtree move while still making hierarchy corrections deliberate. Under a derived policy (title, ETA) a dropped row
  would be re-sorted straight back out of its slot, so offering the handle would be a lie — and
  backlog rank is per-team in ADO, so without a team a move would rank against a guess. Ranking
  against only the visible rows would place the item relative to whatever the filter happened to
  leave, so clearing the filter would reveal it somewhere the user never dropped it.
- Consequence: the tree renderer takes the **parent item** rather than a bare list, because a level's
  identity (which item a dropped row becomes a child of, plus its full sibling order) is what a drag
  needs and a list alone cannot supply.
- Consequence: `ChildItemsBadge` exposes the assembled popup row and title through `onRowReady`, so
  Project Tracking can register hidden-depth children with the same controller without moving work
  item identity or persistence into the shared, domain-agnostic control. A one-shot parent id in
  `BoardSession` reopens that popup after the accepted move repaints the tree, then clears itself so
  unrelated repaints never resurrect a popup the reader closed.
- Consequence: the move is persist-then-reflect like every other control on the board — the tree is
  not touched until ADO accepts it — so there is no rollback path to get wrong.

## ADR-042: When ADO refuses to rank an item, the extension writes the rank field itself

- Context: `_apis/work/workitemsorder` only ranks items that already hold a position on the **team's
  backlog**. An item with an empty `Microsoft.VSTS.Common.StackRank`, or one nested under a parent of
  its own category (story→story, feature→feature — which
  [Azure Boards documents as not orderable](https://learn.microsoft.com/azure/devops/boards/backlogs/resolve-backlog-reorder-issues)),
  is answered with `TF400486` **every time**. Its wording ("you or another user has modified, removed,
  or re-parented items") blames a concurrent edit, which is the wrong place to look entirely: nothing
  is racing, and no retry, reload or fresher `rev` can ever clear it.
- Decision: try the backlog endpoint first; when it refuses at the **order** stage, fall back to
  writing `IMPORTANCE_FIELD` directly — the midpoint of the neighbours' gap, a full `RANK_SPACING`
  step past the only neighbour at either end, or a whole-level renumber anchored to the level's lowest
  existing rank when nothing fits. The refusal is logged with ADO's exact words **and** a plain-English
  explanation beside them.
- Rationale: the same approach the team's existing PowerShell project tracker already proved in this
  org. `IMPORTANCE_FIELD` is the very field the board sorts "by importance" on, so writing it is the
  same outcome the backlog endpoint would have produced, minus its refusal. The alternative — failing
  the drop forever — makes drag-reorder unusable on exactly the boards this extension exists for.
- Consequence: the reorder request carries `siblingIds`, the destination level in **post-drop** order.
  The worker cannot derive it (it has no tree), and the two neighbours alone are not enough to
  renumber a level.
- Consequence: the rank writes send **no `test /rev`** guard. A rank is a position the operation just
  computed from a read taken moments earlier, not a value a person authored; guarding it would reject
  the write whenever anyone had touched an unrelated field, and in a renumber that would leave the
  level half-ranked.
- Consequence: a move now reports `reparented` and `ranks` even when it fails. ADR-041's
  persist-then-reflect rule stands for the parts ADO rejected, but a re-parent ADO **applied** must be
  reflected or the board keeps showing a tree that no longer exists and resends a doomed request; and
  a renumber changes siblings the user never dragged, so every written rank is copied back.

## ADR-043: Item notes are the ADO Discussion, fetched on first open, bounded twice

- Context: the Project Tracking board needs each item's running commentary. Azure DevOps already has
  exactly that in the work item's **Discussion**, and the binding already declares an
  **Updates window (weeks)** property that nothing consumed.
- Decision: "notes" ARE the ADO discussion comments — no parallel store, no custom field. They are
  read through `_apis/wit/workItems/{id}/comments` and authored as **Markdown** (`format=0`).
- Decision: a panel fetches on **first open**, not with the board. A tracking board routinely shows
  dozens of items; reading every discussion up front would fire dozens of credentialed requests for
  panels nobody opens. The result is cached for the session, and a failed read clears the cache so a
  later open retries rather than staying broken.
- Decision: the list is bounded **twice, for different reasons**. The `weeks` window bounds what is
  FETCHED (a per-query setting, so a team that reviews fortnightly sees a fortnight); the **two most
  recent days that have notes** bound what is SHOWN, so an expanded panel stays a glance. Days, not a
  note count: a burst of updates in one afternoon is a single conversation and must not be cut in half.
- Decision: the work item **type icon** in front of the title IS the notes toggle, at three emphasis
  levels: grey (no discussion), the type's color dimmed (something to read), full color (open). A
  dense row cannot afford another control, and three states make "where are the notes?" answerable by
  scanning the board's left edge rather than by clicking every row.
- Consequence: `System.CommentCount` is read with the tree. The grey state has to be known BEFORE a
  panel opens, and the whole point of fetching on first open is that most panels never do. It is a
  TOTAL, so it is treated as "worth opening" and CORRECTED to the real in-window count once a panel
  reports one — an item whose comments all predate the window starts colored and settles to grey.
- Consequence: a FAILED read never greys an icon. The count is then unknown, not zero, and claiming
  "no discussion" because nobody could read it is worse than leaving the previous answer showing.
- Consequence: the read also returns the signed-in identity (`_apis/ConnectionData`) in the same
  MAIN-world call, because "which of these may I edit?" is unanswerable without it and useless
  without the notes it qualifies. Ownership is matched on identity GUID first and sign-in address
  second — never display names, which two people routinely share.
- Consequence: editing is offered only on the reader's own notes. ADO rejects anyone else's edit, so a
  universal affordance would be a button whose only purpose is to fail. Authorization stays on the
  server; the UI only declines to offer what would be refused.
- Consequence: every failure is **classified** (`http` / `sign-in` / `network`) rather than collapsed
  to an empty list. ADO answers an expired session with a 200 carrying its HTML sign-in page, which
  would otherwise parse as "this item has no notes" and leave nothing in the log to explain it.

## ADR-044: Author-written content renders through one control, allowlist-rebuilt

- Context: descriptions were previously written to the page as plain text, so ADO rich text and
  Markdown arrived as literal markup. Rendering them means rendering content written by whoever edited
  the work item — any teammate, and on a public project anyone at all — INSIDE the reader's signed-in
  ADO page.
- Decision: one shared control (`common/view-common/control/MarkdownText`) renders every piece of
  author-written content: item descriptions and every discussion note. What may render, how an image
  loads, and what an `@`-mention looks like are then decided in exactly one place.
- Decision: nothing is ever assigned to `innerHTML` on the live document. The source is parsed into an
  **inert** document (`createHTMLDocument` — no browsing context, so no script runs and no image
  request fires while parsing), then rebuilt node by node against an **allowlist**. Unknown elements
  are unwrapped to their text; `<script>`/`<style>`/`<iframe>`/form controls are dropped whole; every
  attribute except the few named per tag is discarded, which covers `on*` and `style` by construction.
- Decision: ADO's own `renderedText` is preferred over the stored source when the response carries it,
  because that is where ADO resolves an `@`-mention to a person's name — the raw Markdown only holds
  their GUID. The source is still kept, because an edit must re-open what the author typed.
- Consequence: ADO attachment images need no proxy or token handling here. The view renders inside the
  ADO page, so an attachment URL is same-origin and the browser sends the session with it — unlike the
  team's PowerShell tracker, which had to proxy them through its local server.
- Consequence: the Markdown converter is hand-written rather than a dependency. This code is injected
  into every ADO page, the input is the narrow subset ADO's own editors produce, and its output is
  never trusted — the sanitizer is what makes passing raw HTML through safe.
- Consequence: `TrackedWorkItem.description` is no longer flattened at parse time. The tree loader
  used to strip the tags to plain text, which destroyed embedded screenshots and `@`-mentions before
  any renderer saw them — rendering is the view's job, and sanitizing is the control's.

## ADR-045: A worker listener owns a malformed message and answers with the reason

- Context: notes reads failed with nothing but `no response from background` on the content side and
  **complete silence** in the worker's own log. That message is what `chrome.runtime.sendMessage`
  produces when NO listener returns `true`, which covers three unrelated situations: the message was
  malformed and every type-guarded listener skipped it, the worker is running older code than the
  page (reloaded or updated while the ADO tab stayed open), or the worker failed to start. Nothing on
  either side distinguished them.
- Decision: a listener claims a message by its `type` FIRST (`claimsMessageType`), then validates.
  Filtering on the strict guard makes a listener silently drop a malformed message of its own kind,
  which is precisely the dead end above. This generalizes the rule ADR-040's reorder listener already
  applied, and the notes listeners now follow it.
- Decision: every message-shape contract exposes a `…Problem(value)` describer returning the offending
  field, with the boolean guard defined AS `problem(value) === null` so the two can never drift.
- Decision: the worker logs each notes request on **arrival** and again with its **outcome** (pages,
  HTTP status, failure classification, whether the identity was read). A successful read used to log
  nothing at all, so "never arrived" and "arrived and worked" were the same silence.
- Consequence: the content side's remaining `undefined` response now has exactly one meaning — no
  listener claimed it — so it says so, and names the two causes worth acting on.

## ADR-046: `@`-mentions are resolved in bulk through a directory of their own

- Context: `MarkdownText` has always accepted a `mentionNames` map, but **no production caller ever
  supplied one**, so every mention the extension rendered itself came out as the anonymous
  `@mention` placeholder. Notes escaped it only because ADO's `renderedText` already carries names
  (ADR-044); descriptions have no such rendering, and a note ADO returned no `renderedText` for falls
  back to the raw source and its bare GUIDs.
- Decision: a **separate** contract, `IMentionDirectory` (`resolveNames(ids)` + `knownNames()`), not
  a method on `IUserDirectory` (Interface Segregation). Searching for a person a user is choosing
  between is interactive and per-keystroke; naming ids in content that is already written is a bulk,
  one-shot concern. They also hit different endpoints.
- Decision: **bulk by contract.** Every mention is collected across everything about to be rendered
  and resolved together (`collectMentionIdentityIds` → one read per batch), because a lookup per
  mention per item is a request storm on a board of dozens of items. Both encodings are collected —
  the Markdown `@<guid>` token AND ADO's rich-text `data-vss-mention` anchor — since a board carries
  both. `MENTION_TOKEN_PATTERN` is owned by `common/ado` and shared with the control so the collector
  and the renderer can never disagree about the token shape.
- Decision (**SUPERSEDED by ADR-050**): the endpoint is the `vssps` bulk identity read
  (`{identityBase}/_apis/identities?identityIds=…`), reached through the same background/MAIN-world
  bridge as every other credentialed ADO call. This is the **only** ADO read in the extension that is
  genuinely cross-origin — `resolveAdoIdentityServiceBase` exists to make that hop explicit rather
  than hidden in a URL template. ADO's own SPA makes the same hop from the same page, so the session
  rides along; a tenant that refused it degrades to `network` in the log and unresolved placeholders
  on screen. _(The premise was false: the SPA does not make that hop, and the browser blocks it.)_
- Decision: the board resolves **after** its first paint and repaints, rather than awaiting the names
  before painting. The ids only exist once the tree is in hand, so awaiting first would hold a whole
  board back on a cosmetic detail. A notes panel awaits instead, because it is already showing
  "Loading notes…" and its rows are built once.
- Consequence: `BoardHandle` now exposes `repaint()`. Project Tracking repaints only when the read
  actually learned a name — a repaint that changes nothing is a flicker the reader paid for.
- Consequence: ids are content-supplied, so `buildAdoIdentityNamesUrls` re-validates each one against
  a GUID pattern (they are interpolated into a query string) and `MAX_MENTION_IDS` caps how many
  credentialed reads one message can become.
- Consequence: `MessagingMentionDirectory` asks about each id **once** for the life of the page.
  Dedupe is on an id's _settled answer_, and an in-flight read is **shared, not skipped**: a second
  caller awaits the read a first one started. A dedupe set alone ("already asked") returns an
  incomplete map to whoever asks second, which is precisely how a mention ended up anonymous while
  the identical mention elsewhere on the board resolved.
- Consequence: "no name" is only remembered when the read **completed** (`ResolveAdoIdentityNamesResponse.complete`),
  because the endpoint OMITS ids it cannot resolve — a short answer and a failed batch look the same
  otherwise. A failed batch, a truncated id list, a rejected round-trip or an unclaimed message all
  leave the id open for the next render. Retrying an authoritative "not recognized" is pointless and
  would loop on every repaint, so that one is settled for good and **logged by id**.
- Consequence: the log names the unresolved **ids** (capped at 10) and whether they will be retried.
  A display name is a person's name (AGENTS.md §9); an identity id is the identifier that makes
  "why is this mention anonymous?" answerable from Diagnostics alone.
- Consequence: reasons carry **lengths, never content**. An over-long note is reported by its
  character count; the diagnostics log is exported into bug reports (AGENTS.md §9).

## ADR-047: A manual refresh re-reads AwesomeADO only, and the reader's place outlives the board

- Decision: The Project Tracking board's `⟳` re-reads the tree and the sprint window and repaints in
  place. It **does not** reload the page and **does not** touch ADO's own (hidden) query grid. The
  reader's transient state — collapsed ids, opened note ids, tag selection, sprint selection + filter
  toggle, this session's ordering pick — is lifted into a `BoardSession` owned by the VIEW, not by a
  board, and seeded into each rebuild; scroll is captured and restored around the swap. A refresh
  awaits `WorkItemWriteQueue.whenIdle()` before fetching. A failed re-read keeps the board and is
  reported on the button; pressing it in that state opens Diagnostics and clears the report.
- Rationale: ADR-029 already settled that the two sides share no in-page state, so there is no lever
  on ADO's grid except its own DOM — an undocumented contract that would silently rot. Leaving it
  alone is also not a regression: that grid has been stale since page load. Systempatterns #3 already
  called for refresh "on mount, on manual request"; this is the manual half.
- Consequence: state that survives a refresh cannot live in a per-render closure. `collapsedIds`,
  `expandedNoteIds` and `selectedTags` moved out of `createBoardTreeRenderer`/`renderBoard` into
  `BoardSession`; the sprint picker and ordering picker now record the reader's pick there. An
  UNTOUCHED sprint picker deliberately re-seeds from the fresh window, so a board left open across a
  sprint boundary follows the new current sprint rather than pinning itself.
- Consequence: `whenIdle()` is a queue member, not view code — "is the queue done?" is the queue's
  invariant. It never rejects: a failed write still settles, and the caller is not asking whether the
  writes succeeded (that is `onWriteFailed`).
- Consequence: a refresh that resolves to an invalid tree (no roots, wrong root type) still renders
  the validation scaffold and loses the refresh button. Accepted: the message is truthful, it matches
  first-load behaviour, and flipping to ADO's view and back through the top-bar menu re-renders the
  view from scratch.
- Consequence: the button's busy state spans the POST-paint reads too. The Feature Crew reconcile and
  the bulk `@`-mention lookup deliberately run after the first paint, and each ends in another full
  repaint, so `renderLoadedBoard` returns a `settled` promise (`crewSync.whenSettled()` +
  `resolveBoardMentions`, neither of which rejects) and the refresh clears busy only after it. The
  busy state is re-armed immediately after the swap, because the replacement board's button is built
  idle. Clearing at the first paint reported the board as settled while two repaints were still
  queued, so the reader's next click landed in the middle of them and felt slow while every later
  click was instant.

## ADR-048: The "New notes" pill reads discussions on demand, and narrows only once it can

- Decision: The Project Tracking board offers three recent-activity pills
  (`common/view-common/control/ActivityFilter`) that narrow the tree to items created, changed, or
  commented on
  inside the binding's `hours` window. Created/updated are answered from `System.CreatedDate` /
  `System.ChangedDate`, already in the tree. "New notes" is answered by `RecentNotesIndex`, which
  reads each item's ADO Discussion through the existing `IWorkItemNoteLoader` — but **only when the
  pill is lit**, only for items ADO reports a positive `System.CommentCount` for, at most six reads
  in flight, and at most once per board. While those reads are outstanding the criterion is dropped
  from the filter in force (`activityFilterInForce`) and the pill renders `New notes…`.
- Rationale: ADO exposes a comment **count** on the work item but never a comment **date**, so
  "commented recently" is unanswerable from the tree read (ADR-043 established the count is a TOTAL).
  The only source is the discussions themselves. Reading them with the board would fire dozens of
  requests for a filter nobody asked for — the same argument that made note panels fetch on first
  open. Applying the criterion before the answer exists would empty the board and then repopulate it:
  two visible jumps for a question nobody has answered.
- Consequence: "New notes" reads through its OWN contract, `INoteActivityReader` — not the per-item
  `IWorkItemNoteLoader` (Interface Segregation). Asking through the loader cost one
  `chrome.scripting.executeScript` injection and one service-worker round-trip PER ITEM, plus two
  credentialed fetches and up to 200 `$expand=renderedText` comments each, to read one timestamp;
  that is what made the first use of the pill a visible wait. The bulk reader is one injection
  (`fetchNoteActivityInPage`) that fetches `$top=1&order=desc` per item, six at a time, inside the
  page. The message carries only work item IDS — the worker still builds every URL from the sender's
  own tab location.
- Consequence: the notes answer is recorded as the newest note's TIMESTAMP, not a boolean, and is
  re-tested against each pass's window. A boolean would rot as the rolling window slid forward; a
  timestamp lets an item age out of "newly commented" without being re-read.
- Consequence: `RecentNotesIndex` lives on `BoardSession` (ADR-047), NOT on the board. Each read is a
  message → injected MAIN-world script → two credentialed fetches, so a board-scoped index handed the
  whole cost straight back to the reader on their first click after every refresh — the reported
  symptom that drove this. It is re-validated instead of rebuilt: an item is re-read only when its
  `System.CommentCount` has moved, which the refresh's tree read already reports for free. (A note
  added _and_ deleted between two reads leaves the count equal and goes unseen; self-corrects on the
  next change, and not worth a round-trip per item per refresh to catch.)
- Consequence: those re-reads join the refresh's `settled` promise, so the cost is paid inside the
  spinner the reader is already watching rather than ambushing their next click.
- Consequence: an item whose discussion could not be read is never claimed to be newly commented. The
  failure is logged (per AGENTS.md §9) rather than guessed at in either direction, and is not retried
  on every repaint — a later count change earns it another try.
- Consequence: the pill selection lives in `BoardSession` (ADR-047), so it survives a repaint and a
  refresh and is never written back to the binding — the same rule the sprint, tag and ordering picks
  follow.

## ADR-049: Pills OR within a group and AND between groups; the child rollup ignores filters

Two rules about how the Project Tracking board narrows, both settled after comparing it against the
team's reference PowerShell board (`View-ProjectTracking`) and deliberately choosing a different
answer in one of them.

- Decision: the filter pills form two independent GROUPS — the Feature Crew tags and the
  recent-activity pills. Pills **within** a group are OR'd; the two groups are **AND'd**. A group
  with nothing lit imposes nothing. So lighting a second tag widens the board, while lighting an
  activity pill on top of a tag narrows to that person's recent work.
- Why: the reference board ORs every pill together (`nodeMatchesTag || nodeMatchesBlocker ||
nodeMatchesChange`). Copied here, that makes an activity pill drag in items belonging to people the
  reader has explicitly filtered out — the selection stops meaning "whose work am I looking at?". The
  two groups answer different questions (WHOSE vs WHAT CHANGED), so intersecting them is what makes
  combining them useful. **This is an intentional divergence from the reference; do not "fix" it back.**
- Consequence: `matchesRecentActivity` answering `true` when nothing is lit IS the "unlit group
  imposes nothing" rule, so `matchesLitPills` needs no separate is-anything-lit test.
- Decision: the deepest row's rolled-up "done / total" child badge is built from the item's COMPLETE
  child set, ignoring every active filter.
- Why: the rollup answers "how much of this item is done?", which is a fact about the work, not about
  what the board is currently narrowed to. Filtering it made the denominator lie — a child on another
  sprint silently left the total, and under the resolved-age window (4 days by default) a row whose
  children had all finished last week lost its badge entirely and read as having no children at all.
  This matches the reference board, whose task pill is always `done/total` over every child.
- Consequence: `createMinorChildrenBadge` deliberately does NOT call `isVisibleUnderFilter`. The
  sprint/tag/activity/resolved rules bound the OUTLINE only.

## ADR-050: Mentions resolve through the same-origin Identity Picker, one request per person

- Supersedes the endpoint decision in ADR-046. Everything else in ADR-046 (the `IMentionDirectory`
  contract, shared in-flight reads, `complete`-gated settling, logging by id) stands unchanged.
- Context: the `vssps` bulk read ADR-046 chose can never succeed from the page. `vssps` answers the
  credentialed preflight with `Access-Control-Allow-Origin: *`, and the fetch spec forbids a wildcard
  when credentials mode is `include`. Every mention on every board resolved to nothing, reported as
  `Mention resolution failed (network, HTTP 0)`. No request header on our side can change this, and
  the collection base does not front `_apis/identities` (404).
- Decision: resolve through `{collectionBase}/_apis/IdentityPicker/Identities`, the endpoint ADO's
  own SPA uses for mention chips. It is **same-origin** with the page, so the read carries the
  session with no CORS involved at all — which also removes the extension's only cross-origin ADO
  dependency and the `vssps` host knowledge that came with it.
- Decision: `queryTypeHint: "uid"` is part of the contract, not a tuning knob. Without it the picker
  matches the GUID against display names and answers HTTP 200 with zero identities — a total failure
  wearing a success's clothes.
- Consequence: **the bulk property of ADR-046 is lost at the transport.** The picker's `query` is one
  opaque string; a comma-separated list returns a single unmatched token. Resolution is now one
  request per distinct person, run through a pool (`MENTION_REQUEST_CONCURRENCY`) so a board cannot
  starve the ADO page's own traffic. This is affordable only because ADR-046's session-long memo
  already guarantees a person is asked about once — collect-then-resolve stays bulk at the CALLER,
  which is what kept the request count proportional to people rather than to mentions.
- Consequence: `MAX_MENTION_IDS` drops from 1000 to 200. It was a URL-length budget; it is now a
  credentialed-request budget, and the old value would have authorized 1000 round-trips.
- Consequence: names are keyed by each result's echoed `queryToken`, not by an id on the identity.
  The picker returns both `localId` (what a mention stores) and `originId` (the directory object);
  keying by the wrong one files every name under an id no mention will ever look up.
- Consequence: `resolveAdoIdentityServiceBase` is replaced by `resolveAdoOrganizationBase`, and the
  in-page reader's outcome is merged in **id order** rather than completion order so a pooled read
  still produces a deterministic diagnostics line.

## ADR-051: Shared Markdown authoring and marker-note visibility

- Decision: `common/view-common/control/TextEditor` owns Markdown authoring behavior for every
  multi-line note/comment and description edit: Ctrl/Cmd+B and Ctrl/Cmd+I wrap the selection, an
  HTTP(S)-only paste becomes an empty Markdown link, and an optional injected `IUserDirectory` opens
  a no-input `@` suggestion list. Enter stores the selected person as ADO's `@<localId>` token;
  `DirectoryUser.id` therefore preserves the picker's local identity GUID when one exists. Titles
  remain one-line and do not enable these behaviors.
- Rationale: authoring behavior repeated at note-add, note-edit, marker-reason, and description call
  sites would drift. One shared control makes the key handling, caret placement, directory search,
  reference format, save state, and diagnostics boundary identical everywhere.
- Decision: a discussion entry whose source text starts with any non-empty configured Marker Tags
  `commentTag` is operational marker history, not a reader-authored note for the board's glance or
  **New notes** signal. Inline panels remove those entries before selecting their two recent days;
  the explicit **View all notes** surface bypasses the removal and remains a complete discussion.
- Consequence: `INoteActivityReader` carries bounded `excludedPrefixes`. Its MAIN-world reader asks
  for newest-first source pages and follows ADO continuation tokens until it finds the newest
  non-marker comment. Hitting `MAX_NOTE_ACTIVITY_PAGES` is reported as incomplete, never as an
  authoritative null date. URLs remain worker-built from the sender tab; prefixes cannot widen the
  closed operation.

## ADR-052: Project Tracking stripes visible rows in reading order

- Decision: Project Tracking assigns its two row backgrounds in visible depth-first order and
  reassigns them whenever a branch expands or collapses. The row, alternate, hover, and emphasized
  hover colors are required roles in every concrete AwesomeADO theme. Holding `Ctrl+Shift` marks the
  rendered view for the emphasized hover treatment through one shared modifier tracker per document.
  Each item owns one visual surface containing its row, direct open notes, and description panels;
  normal hover and emphasized hover paint that complete surface continuously, while the nested child
  container remains outside it. Normal hover stays close to each theme's row stripes; modifier
  emphasis remains the deliberately stronger tracking signal. The surface preserves the existing total vertical spacing but moves
  half of the row's former padding below the final visible panel.
- Rationale: tree rows are nested inside per-parent child containers, so CSS `:nth-child` restarts at
  every depth and counts hidden branches; it cannot keep the visible outline alternating through an
  expansion. Explicit visible-order parity makes the reading sequence stable, while theme-owned roles
  preserve tuned contrast independently in Dark, Light, and Blue.

## ADR-053: Area-path filtering uses full values, shortest unique labels, and session state

- Decision: `TrackedWorkItem.areaPath` carries the full `System.AreaPath` fetched with the Project
  Tracking tree. The shared `common/view-common/control/AreaPathFilter` receives and returns only
  those full values; display labels begin at the leaf and grow toward the root one segment at a time
  only while another offered path has the same label.
- Decision: Project Tracking derives the offered paths from loaded descendants that are not hidden by
  the resolved-age predicate and keeps the selected set in `BoardSession`. No other active filter
  changes the offered paths. Selected paths OR together as their own filter group, which ANDs with
  sprint, crew-tag, recent-activity, marker, and resolved-age filtering. The existing recursive
  visibility predicate keeps ancestors of a matching descendant visible.
- Rationale: leaf labels make the common case compact, while minimum suffix expansion removes
  ambiguity without filling a small header popup with repeated project prefixes. Filtering must use
  the full server value so two identical leaves never collapse into one condition. The choice is a
  transient reading position like sprint and in-view ordering, so persisting it to the query binding
  would turn a quick narrowing action into a synced setting and force an unnecessary board reload.
  Applying the always-on resolved-age rule while collecting options prevents a choice that can never
  reveal an item, while ignoring interactive filters keeps those independent controls composable.
- Amendment (item changes): Project Tracking's item right-click menu receives the exact eligible
  full-path list already supplied to the header filter. **Change area path** computes shortest unique
  labels against that complete list before omitting the target item's current path, so removing one
  colliding value cannot make the submenu call a path something different from the filter. Each row
  keeps the full path as its tooltip and value, and the selected `System.AreaPath` is persisted through
  the board's existing `WorkItemWriteQueue` with the current path as `baseValue`; the model repaints
  only after the write commits.

## ADR-054: Changelog entries describe release outcomes, not development chronology

- Decision: `## Next Version` stages unreleased notes, and released headings use the developer-owned
  `Major.Minor` base rather than the full CI-generated package version. The changelog uses one bullet
  per coherent user-visible capability or meaningful fix. Related implementation changes and minor
  UX rearrangements are consolidated into that outcome; refactors, tests, tooling, and internal
  architecture are omitted unless users or operators experience a changed result. An initial release
  summarizes the finished product instead of preserving its development history.
- Rationale: Store customers and operators need a scannable account of what a release enables or
  fixes. Mirroring every implementation step makes meaningful changes harder to find, overstates
  cosmetic iteration, and leaves an initial release reading like an internal build log. Base-version
  headings also match the release validator and the official `vMajor.Minor` release contract while
  CI remains free to assign the `Build` component.
- Amendment: release notes are accumulated continuously rather than reconstructed when a version is
  cut. Every task is classified as user-visible or internal at the start; before final verification,
  the serial coordinator merges each completed user-visible outcome into `## Next Version` at the
  capability level and leaves internal work out.

## ADR-055: Defer heavy view code and retain server reads at board-session scope

- Decision: The classic host-wide content script keeps only eager renderers it needs immediately.
  Project Tracking is built as a web-accessible ESM entry, resolved through a cached registry on
  first use, and store builds minify every bundle. `EnhancedViewSurface` leaves ADO visible while a
  deferred renderer loads, rejects stale resolutions by request generation, and calls an optional
  renderer `dispose(root)` hook before removing its DOM.
- Decision: Project Tracking owns loaded and in-flight note-panel state plus `RecentNotesIndex` in
  `BoardSession`, so DOM repaints and manual refreshes reuse reads. Refresh prunes cache entries for
  ids absent from the new tree. Tree hydration preserves 200-id paging but reads through four bounded
  lanes; network, 408, 429, and 5xx responses receive at most three attempts with bounded backoff.
- Rationale: Route gating prevents API and DOM work on unrelated ADO pages but does not prevent the
  browser from parsing an eagerly bundled board. Replacement DOM is also the wrong lifetime for
  server data: filtering, ordering, and refresh should not refetch unchanged discussions. Bounded
  concurrency removes serial network latency without overwhelming ADO, while finite transient retry
  avoids surfacing brief service failures as permanent load errors.

## ADR-056: Team configuration is authoritative in one ADO work item Description

- Decision: a team shares the full existing `AwesomeADO.config` payload through `System.Description`
  on one Azure DevOps work item in the same organization as its queries. The item id is a separate
  synced trust anchor (`teamConfig.workItemId`), never part of what a pull may use to redirect itself.
  User-selected file export/import includes that ID for backup and restore, but the compact payload
  published to Description omits it and a remote pull never writes the source store.
  Connected clients pull on saved-query entry and can pull explicitly in Options. A normalized
  unchanged snapshot is a no-op; a malformed or partially valid snapshot is rejected wholesale.
- Decision: publishing is explicit, never triggered by an ordinary local edit. It reads the current
  work item revision and sends Description plus `/multilineFieldsFormat/System.Description =
Markdown` in one `/rev`-guarded JSON Patch. The PATCH is not retried; a concurrent publisher gets
  a visible conflict and must pull before deliberately trying again. Idempotent GETs receive at most
  three attempts with bounded backoff.
- Rationale: browser sync is user-scoped and file import cannot propagate additions or deletions.
  An ADO work item is already permissioned, versioned, and readable through the session every query
  viewer uses, including another team with access. Keeping the locator outside the payload preserves
  the user's trust decision, while full replacement makes removing a binding centrally remove it
  for every connected client on its next query open.

## ADR-057: Version-tag trust is repository-owned on the personal GitHub account

- Decision: the release workflow remains on the personal `RazMake/AwesomeAdo` repository and accepts
  only its two repository-owned tag rulesets. Both policy checks require
  `source_type == "Repository"`, `source == GITHUB_REPOSITORY`, active enforcement, exact
  `refs/tags/v*` conditions, and the existing exact creation/update/deletion rule shapes. The
  organization-only `conditions.repository_name` assertions are removed.
- Rationale: repository rulesets provide the same scoped creation and immutability controls for a
  public personal repository. Requiring an organization did not strengthen the checked tag rules;
  it only made the release gate impossible for the repository's actual owner type. Pinning `source`
  to the full repository name prevents an inherited or unrelated ruleset from satisfying the gate.
- Consequence: no repository transfer or URL migration is part of release setup. The release GitHub
  App is the only bypass actor on the creation ruleset; the immutable update/deletion ruleset has no
  bypass. Release-sensitive CODEOWNERS entries name the personal owner `@RazMake`, not an
  organization team. The baseline stays disabled until these repository controls and all other
  release trust inputs are configured.
- Amendment: a personal repository can enable immutable releases directly but cannot inherit an
  organization-owner policy, so GitHub reports `enabled: true` and `enforced_by_owner: false`. The
  publisher requires strict repository enablement when it starts and rechecks it immediately before
  publishing an official release; it does not require the organization-only field. The existing
  baseline version remains the identifier for this reviewed personal-owner control set.
- Amendment: the protected `browser-extension-stores` environment intentionally allows administrator
  bypass. The release gate requires `can_admins_bypass == true` while retaining its `main`-only
  deployment policy, required reviewer, and self-review prevention checks.

## ADR-058: Hierarchy delivery classification uses Primary work

- Decision: A configured work-item type may carry `isPrimaryWork: true`, shown in the hierarchy as a
  **Primary work** checkbox. Primary work means independently trackable delivery. Unchecked levels
  above it are **Planning context**; unchecked levels below it are **Implementation details**. The
  first/root type is always planning context: its checkbox is disabled and normalization removes the
  flag from imported or stored data.
- Rationale: Azure DevOps calls every entity a work item, so “work item” cannot distinguish an Epic
  from a User Story. A binary “context/work” label also misclassifies Task-like levels that support
  delivery but do not stand on their own. Naming the positive boundary Primary work gives one useful
  flag while position supplies the two unchecked meanings. In Epic → Feature → User Story → Task,
  Epic and Feature are planning context, User Story is primary work, and Task is an implementation
  detail.
- Amendment: Project Tracking carries `isPrimaryWork` into its type catalog and renders every Primary
  type plus the planning-context types on paths above one as tree rows. Direct children below that
  boundary render in `ChildItemsBadge`; sibling child types may split between rows and a badge. A
  Primary leaf therefore appears as child rows, while the same leaf left unchecked appears in the
  badge. Configurations with no Primary flags retain ADR-035's two-level behavior for compatibility.
- Amendment: `QueryPageController` fingerprints the settings consumed through
  `EnhancedViewServices` and invalidates `EnhancedViewSurface` when that configuration changes, so
  an open Project Tracking view redraws immediately after a Primary-work edit. Theme and routing
  settings stay outside that fingerprint: theme changes recolor the existing DOM, while default-view
  changes continue through the controller's ordinary show/restore decision.
- Amendment: Sprint View's Project filter offers only query ancestors whose configured types are
  strict ancestors of a Primary-work type, recursively through the hierarchy. A choice must also lead
  to work surviving the sprint and other active filters. Primary-work items and implementation details
  are not projects, even when the query nests eligible work beneath them. Choices carry their type
  color and raw title into the shared hierarchy control. That control searches titles by
  case-insensitive substring while retaining each match's visible ancestor stack, and expands toward
  the viewport margin before truncating labels with a full-text tooltip.

## ADR-059: Sprint execution is team-roster-gated and sprint switches replace the session

- Decision: Sprint View reads the saved query definition independently from execution. On initial
  load, manual refresh, and sprint selection it starts that original-WIQL read while resolving the
  sprint window, pages every member of the configured team, and only then executes a copy whose
  `@CurrentIteration`/`@CurrentSprint` offset matches the selected sprint. The hydrated tree keeps
  team-assigned or unassigned work and the parent chains needed to reach it. Team pills are emitted
  in roster order before Unassigned; Lane and Project choices are derived only after tree pruning.
  Selecting another sprint destroys the Sprint View session and DOM, resets every filter, and reloads
  team members, WIQL, work, Lane choices, and Project choices. The roster operation logs request,
  outcome count, and detailed failures without logging member identity.
- Rationale: Team membership is the authoritative membership boundary for Sprint View; capacity is
  optional planning data and must not decide who belongs to the team. Executing work before the roster
  is known could expose out-of-team items, and deriving filters before pruning could leak their area
  paths or parents. Keeping
  the saved WIQL immutable prevents offsets accumulating across repeated sprint changes. Replacing
  session state avoids stale filters and derived options silently narrowing a different sprint, while
  manual refresh may still preserve the reader's filters because it does not change sprint context.

## ADR-060: Sprint cards move through an area-by-state table atomically

- Decision: Sprint View renders exact area paths as table lanes and the first four fixed application
  state ordinals as columns, using the user's configured labels and theme-owned neutral, blue, amber,
  and green fills. Queue, Active, and Waiting cards are tall; Done cards start compact and expand on
  click or keyboard activation. Only types explicitly marked `isPrimaryWork` render as cards. Every
  card shows wrapped title, ID, assignee, a type-colored edge, and, while large, the shared
  completed/total badge; that badge lists only the item's direct children. Cards inside one lane/state
  cell and child rows use the shared manual backlog-rank order. Child rows carry an editable
  completion checkbox plus shared Assigned To and ETA controls, and persist sibling title-drag moves
  through the board's write queue. The card drag controller ignores their bubbled drag events rather
  than canceling the native child drag. Opening a child
  popup disables its owning card as a drag source until trigger, Escape, outside-pointer, or action
  dismissal closes it. Tall cards also show the immediate parent and only the three configured marker
  conditions.
- Decision: every card is draggable while its child popup is closed. A destination column resolves through that work-item type's
  configured ordinal to its primary ADO state; a destination lane supplies the full
  `System.AreaPath`. Drops are persist-then-reflect through the per-view `WorkItemWriteQueue`. A
  diagonal drop carries state and area as one bounded `WorkItemFieldWriteRequest` with
  `additionalFields`, producing one `/rev`-guarded JSON Patch and one resulting revision.
- Rationale: application state is the configured board ordinal, not raw `System.State`, and area-path
  lanes must retain full values even when their labels show only the leaf. One patch is required for
  a diagonal gesture: two writes would make the second race the revision created by the first and
  could leave half the drag committed.
- Amendment: cards no longer move between area-path lanes. A drag remains inside its source lane.
  The cursor-following card uses a custom fixed 90%-opaque clone that retains the source card's
  resolved background across destination columns, suppressing the browser's native drag fade; the
  source card remains 90%-opaque to mark its origin. Each active destination column frames its sticky
  title with its own semantic foreground color.
  Destination cells own slot resolution rather than individual cards, so reversing
  upward through an inter-card gap still produces a target. The sticky column title always
  highlights; backlog-rank mode shows an in-place shadow at a visible destination slot, while an
  empty destination appends last and shows no false reorder target. A cross-column positioned move
  prepares the destination `System.State` through the existing guarded field writer, carries its
  returned rev into the rank request, and keeps both under one serialized queue action. A later rank
  failure reports the already-landed state so the board reflects server truth. Another card in the
  same cell previews an insertion line and persists backlog rank. The shared top-right ordering picker applies
  backlog-rank (default), title, or ETA order to cards and direct children; title/ETA modes disable
  manual card and child reorder but retain cross-column state changes. A Done card keeps child
  completion, ordering, child Assigned To/ETA, and ancestor ETA read-only even after expansion. Interactive card
  controls, including the parent hierarchy panel, cannot arm the owning card's drag. A completion
  repaint closes the old child popup's document listeners, preserves its open state, and reopens the
  rebuilt popup in both completion directions.
- Rationale for amendment: lanes are a grouping boundary, not a drag-edit affordance. Rank is the
  only ordering policy a manual drop can persist without the next render undoing it, while state
  changes remain meaningful under every display order. Done work and its context remain inspectable
  without exposing controls that should no longer mutate its plan.

## ADR-061: Interrupt acceptance belongs to the current tagged lifetime

- Decision: an Interrupt is accepted only when a Discussion revision containing the configured
  Interrupt comment token occurs at or after the most recent revision that added the configured
  Interrupt tag. The reader pages the work-item updates stream by actual returned count and derives
  `System.Tags`, `System.History`, and `System.ChangedDate` from that one revision timeline. Failed
  items remain unknown rather than being guessed unaccepted.
- Rationale: checking for any historic acceptance note lets an old note survive tag removal and a
  later re-tag. The updates stream orders both facts without guessing from the item's broad current
  `ChangedDate`; equality supports the single-patch “tag as accepted” action.
- Consequence: Sprint View alone exposes Tag/Accept/Clear Interrupt commands. Tagging as accepted
  writes `System.Tags` and the configured acceptance note in one JSON Patch. A themed checkbox in
  the menu row selects proposed versus accepted and updates the preview; selecting acceptance opens
  the shared titled Markdown/mention editor. Accept stays disabled until a non-empty reason exists,
  and the configured token prefixes that reason in `System.History`. Existing Interrupts use the
  same dialog. Accepted pills use solid Interrupt purple; raised pills use a 24% fill with a 1px
  bright-purple edge. Interrupt filter pills always use accepted paint, since they represent the
  condition rather than one item's acceptance state. Project Tracking does not expose mutation
  commands, but both views use the same accepted/unaccepted state and shared paint.
- Consequence: the typed reader pages through the existing retrying MAIN-world request, with URLs
  built only from the sender tab. Both views paint immediately and resolve acceptance afterward;
  Sprint generation-guards the repaint so a slow read cannot hold the board blank or repaint a
  different sprint.

## ADR-062: Sprint bulk movement owns a confirmed visible-card snapshot

- Decision: the Sprint title offers bulk movement only while a past sprint is selected. Choosing a
  current/future destination opens a confirmation that groups the exact currently visible eligible
  cards by Lane and assignee. Lane display uses the same shortest-unique-suffix labels as the Lane
  dropdown, while candidates and guards retain full Area Paths. Eligibility is assigned, non-Done Primary work; unassigned visible
  cards are reported as excluded. The operation snapshots those IDs at confirmation and never adds
  filtered-out cards, implementation-detail descendants, new query arrivals, or cards revealed by a
  later filter change.
- Decision: each snapshot ID is freshly read before writing and its `System.IterationPath` patch
  atomically tests `System.State`, `System.AreaPath`, and `System.AssignedTo`. Changed, missing, Done,
  or unassigned cards are skipped. A preconditioned write never uses the primary-field-only rebase;
  409/412 returns to a fresh complete pass, at most three times per card before that card is reported
  as failed, so one permanently conflicting card cannot spend the whole pass budget. The identity
  precondition carries `identityTestValue` (`Display Name <unique.name>`), not the sign-in address
  that SETS the field: ADO compares a `test` literally, so the write form refuses every patch with
  HTTP 412. Transient failures receive three retries with backoff;
  execution is bounded to 100 passes and 10,000 confirmed IDs.
- Decision: while active, view interactions are blocked and unload receives the browser warning —
  except the header status region, whose controls stay clickable and are updated in place rather than
  rebuilt, because Cancel and the link to the failure log are exactly what a user needs while the run
  holds everything else shut.
  Cancel or Escape finishes the current write and abandons the remainder. Header progress reports
  moved/failed/skipped counts and links failures to Diagnostics; completion refreshes the sprint.
- Rationale: the visible filtered table is the user's team/scope boundary. Re-evaluating filters or
  discovering source-sprint work after confirmation would make the dialog's counts false and could
  move another team's work. Exact snapshot membership plus fresh server guards preserves both the
  user's confirmed scope and protection against cards becoming Done or changing ownership mid-run.

## ADR-063: Sprint area-path selections are dated team configuration

- Decision: default full paths are a per-query Sprint View binding property. `sprintAreaPaths` is a
  normalized `ExtensionSettings` field whose per-sprint records are keyed by full iteration path and
  store selected full paths plus ADO's sprint start/finish dates. Full configuration transfer carries
  both the binding property and the records automatically. Options presents the property as one
  autocomplete row per path with individual add/remove actions; suggestions come from the project's
  complete area classification tree, while the persisted value remains newline-delimited for
  compatibility. Add is disabled while blank, row actions remain adjacent to their textboxes, and
  save/error feedback stays inside the binding configuration card. A connected binding mutation
  publishes the complete proposed binding map before writing local synced storage; disconnected
  mutations skip that remote step. This ordering prevents the local observer's Sprint redraw and
  mandatory pull from restoring the previous team payload over the new binding.
- Decision: opening, refreshing, or switching a sprint pulls the connected team configuration and
  loads that sprint's saved selection when one exists; the saved record takes priority even when it
  is empty. Binding defaults apply only when no record exists and are never auto-materialized. Every
  Sprint Lane change updates immediately and serially publishes the resulting full configuration
  through a bounded content-to-background write and the existing revision-guarded Description patch.
  The title-menu Reset command runs that same write with the binding defaults and is disabled when
  the default list is empty.
- Decision: pruning retains all current, future, and undated records plus the ten most recently
  finished sprints. Older completed records are deleted whenever a sprint record changes, keeping the
  shared Description bounded without guessing about records whose dates are unavailable.
- Rationale: each saved query can represent a different Lane scope, so its initial list belongs to
  the binding. Once anyone changes Lane, that sprint selection is a team decision that must survive
  refreshes and be identical for every viewer. Storing date bounds with each record makes the
  ten-sprint retention rule deterministic even after a sprint falls outside the configured picker
  window.

## ADR-064: A shared query link grants a read-only, single-query connection to non-members

- Decision: a saved-query URL may carry `?awesomeAdoConfig={workItemId}` (parsed by
  `common/navigation/SharedQueryLink`). The parameter names a work item id and nothing else, so a
  link can never inject configuration values; it can only point at an item the recipient's own ADO
  session is allowed to read.
- Decision: what the link is allowed to change depends on Azure DevOps' own team roster, never on
  the link. `SharedQueryLinkService` resolves the item, reads the team it names, and asks
  `common/ado/TeamMembership` whether the signed-in identity is in that team's roster. A **member**
  adopts the item as their `teamConfig.workItemId` outright and pulls, identically to connecting on
  the options page. A **non-member** gets an entry in a separate synced map
  (`sharedQueries.workItemIds`, one work item id per query id) and nothing else changes: their
  settings, their bindings, and any team they do belong to are untouched.
- Decision: membership is a three-valued answer. `TeamMembershipReader` returns `null` when the
  roster or the signed-in identity could not be read, and an undetermined answer takes the
  non-member path. An unread roster is not permission, and the narrow outcome is the only one that
  changes nothing the user owns.
- Decision: a shared query's configuration is applied per query, not per tab.
  `content/shared-query` re-resolves on every SPA navigation and layers the publisher's settings over
  the reader's own (`overlaySettings`) while substituting only that one query's binding
  (`overlayBindings`). Leaving the query takes the publisher's configuration with it.
- Decision: `SharedQueryConfigResolver` reads each configuration work item at most once per
  resolver, failed reads included. Teams commonly share several queries from one item, so a
  per-query read would multiply a credentialed round trip for an answer that cannot differ; the
  options page invalidates the resolver before a reload rather than bypassing it.
- Decision: a work item that cannot be read leaves the link in place and renders nothing. Dropping
  the link on a transient failure would silently un-enhance the query permanently.
- Decision: the Options Query Bindings tab lists a shared query with the publisher's values rendered
  as read-only text rather than as disabled inputs, hides Save, and turns Delete into Remove link.
  Those values live in a work item this user cannot write to, so an enabled Save could only ever
  produce a local copy that diverges from what everyone else sees.
- Rationale: sharing an enhanced query with someone outside the team is the common case (a partner
  team, a manager, an on-call reader). Connecting them to the whole configuration would silently
  replace their own; giving them nothing would make the link useless. A narrow read-only connection
  is the only outcome that is both useful to the recipient and harmless to them.

## ADR-065: Configuration export has a full form and a connection-only form

- Decision: `exportConfig` keeps writing the whole configuration to `AwesomeADO.config`.
  `exportConnectionConfig` writes `AwesomeADO.connection.config`, carrying only
  `teamConfigWorkItemId` plus the organization and project needed to reach it, marked
  `configScope: "connection"`. A file with no scope is a full configuration, so every export written
  before this field existed still reads as one.
- Decision: `ImportedConfig` gained `replacesBindings`. A connection file comes back with it `false`,
  and callers skip `IQueryBindingStore.replaceAll` — adopting a connection must never delete the
  enhanced queries the file never described. `TeamConfigSynchronizer` and
  `SharedQueryConfigResolver` both refuse a payload with `replacesBindings: false`, because a
  connection file names a source instead of being one.
- Rationale: handing a teammate the full file also hands them a snapshot that starts drifting the
  moment the team publishes again. The connection file makes them follow the live source instead,
  which is what "join the team's configuration" actually means.

## ADR-066: All Projects Catalog View is the many-root, read-only sibling of Project Tracking

- Decision: `content/views/projects-view` (id `projects`) lists EVERY top-level item a query returns
  as a collapsed "project" that opens into its own tree. Project Tracking keeps its single-root
  requirement; the two answer different questions ("how is this one epic going?" vs. "what is going
  on across all of them?"), and widening Project Tracking to many roots would have made its header
  (one title, one Tech Lead, one ETA) meaningless.
- Decision: the view is **read-only** — no status/priority/assignee/ETA editing and therefore no
  write queue. Its job is to report across many trees; the editing surface for one tree already
  exists, and duplicating it here would have doubled the write paths that must agree about
  `System.Rev`.
- Decision: rows start CLOSED at every level and child DOM is built only while a row is open. A
  query that returns many roots returns many trees; materializing all of them up front spends that
  cost on branches nobody looked at. Open/closed state is remembered by work item id **outside** the
  DOM, so it survives repaints and in-place refreshes (same rule as ADR-047).
- Decision: a row carries only what distinguishes one project from another — type icon, title, child
  count, own tags. No status badge and no assignee: across many trees those columns are noise the
  reader has to scan past, and the one tree they matter for already has Project Tracking.
- Decision: a tag EVERY project carries is the query's own condition, so it is neither offered in the
  filter nor drawn as a pill. Measured over the top-level results (that is what the condition
  selected) and only when there are at least two of them, because one project gives nothing to tell
  its own tags apart from the query's.
- Decision: the header carries the shared `OrderingPicker` in its top-right corner, board-local per
  ADR-039 — a pick re-sorts from the items already loaded and never writes back to the binding.
- Decision: the tag filter's vocabulary is every tag worn ANYWHERE in the loaded tree, not just the
  projects' own; tags differing only in case are one option. A selected tag keeps the matching item,
  its ancestors (so the project stays reachable), and its whole subtree (so a match never looks
  childless). Selected tags OR together, consistent with ADR-049's within-group rule.
- Decision: on every load, tag selections are pruned to what the freshly loaded tree still offers,
  and the drop is logged. The filter only ever offers tags that exist, so a retained stale selection
  would empty the board while the filter chip read "nothing selected" — a blank list with no visible
  cause. Pruning is what makes the "no project matches" state unreachable rather than merely rare.
- Consequence: `enhancedViewRegistry` no longer hard-codes one deferred view. `DEFERRED_VIEWS` maps
  each deferred view id to its bundle and export name, and one generic loader resolves any of them,
  rejecting a bundle whose export id does not match the id asked for. A failed load is forgotten so a
  later attempt retries. Adding a deferred view is one entry there plus the build/manifest/package
  entries (ADR-055 still governs why they are deferred at all).
- Consequence: the compact checkbox multi-select moved out of `AreaPathFilter` into the shared
  `common/view-common/control/CheckboxFilter`, which exchanges opaque values and takes a per-instance
  `classPrefix` so each filter keeps its own selectors (`awesomeado-area-filter`,
  `awesomeado-tag-filter`). `AreaPathFilter` is now that control plus the shortest-unique-label rule;
  the tag filter is that control plus a quick-search, because a team's tag vocabulary is unbounded
  while an area-path list is already collapsed to its distinguishing suffix.
- Consequence: `workItemStatusLabel` and `boardColumnOrdinal` moved to `common/ado/workItemTypes`;
  both views now map an ADO State onto a board column through one definition.

## ADR-067: A project's tracking query is created, linked and bound as one operation

- Context: the All Projects Catalog View lists projects, and the natural next step from a project is
  the Project Tracking board that reports on it. Producing one by hand means creating a saved query
  in Azure DevOps, remembering which project it belongs to, and enabling the enhanced view for it —
  three places to get wrong, and nothing to tie them together afterwards.
- Decision: **Create Project Query** does all three. Azure DevOps creates a recursive
  `WorkItemLinks` tree query over the project and its descendants, saved in the binding's
  `projectQueryFolder` or, when blank, the CATALOG query's own folder; the project gains a `Hyperlink`
  to it, stamped with `PROJECT_QUERY_LINK_COMMENT`; and
  AwesomeADO records the binding that opens that query in Project Tracking View.
- Decision: the stamped comment — not the URL — is what identifies a tracking query. A work item may
  carry any number of hyperlinks, and matching on "is an ADO query URL" alone would adopt any saved
  query anyone ever pasted and then offer to delete it.
- Decision: the create and the link ride in ONE MAIN-world injection, and a failed link deletes the
  query it just created. A query nothing points at is invisible litter in a shared folder. The
  binding is written last and is deliberately NOT rolled back on its own failure: the query exists
  and is reachable from the project either way, so the worst case is one the user enables the
  enhanced view on by hand.
- Decision: the command is disabled — not hidden — once the project owns a query. Creating a second
  is not an undo; it would leave the first linked and bound with nothing pointing at it. The catalog
  learns which projects own one from a single `$expand=Relations` batch read taken with each load,
  and a failure of that read never fails the load: showing the projects is the view's whole reason to
  exist.
- Consequence: `common/ado/projectQuery` owns the WIQL, the naming rules, the query URLs (including
  the prefix/suffix halves the page world needs, because the created query's id only exists there),
  and the link parsing. `IProjectQueryService` carries all three operations, because they are one
  fact seen from three sides.

## ADR-068: "Completed" is the team's last board column, and its query cleanup is asked

- Context: retiring a project has two halves that are not equally reversible — the project's own
  state, and the saved query that reports on it. A team that reports on finished work would lose that
  report if the query went automatically, with no way to get it back.
- Decision: **Mark completed** writes the primary Azure DevOps state of the LAST board column
  configured for that item's type. "Completed" is the team's own word — one process calls it Closed,
  the next Done — so it is read from the configured catalog rather than named in code. A type with no
  columns leaves the command visible but inert instead of guessing.
- Decision: deleting the tracking query is a separate, explicit answer in the confirmation. The state
  change goes first: a completion whose cleanup failed is a correct and recoverable outcome, whereas
  a query deleted for a project that was never completed is not. The AwesomeADO binding is dropped
  only once Azure DevOps confirms the query is gone.
- Decision: the hyperlink to remove is located by the worker immediately before it is removed, never
  named by the caller. JSON Patch addresses a relation by INDEX, and an index read minutes ago on a
  board is precisely what a concurrent edit invalidates — removing whatever now sits at that slot.
  The removal is guarded by both the revision and the link's own URL, and a project carrying no link
  still has its query deleted.
- Consequence: the command pair lives in `content/views/project-tracking/item-commands/
ProjectLifecycleCommands`, shared by the catalog (per project row) and by Project Tracking (on its
  title, where **Create Project Query** is suppressed because the board already is one). Keeping them
  in one place is what stops "completed" from meaning one state on one surface and another next door.

## ADR-069: What a catalog-created project is born with comes from the query, then the binding

- Context: "Add new project" is only useful if the project it creates appears in the catalog that
  created it — which means being born with whatever the bound query selects on.
- Decision: `projectTag` defaults from the first `System.Tags CONTAINS` membership filter in the saved
  query's WIQL. That remains correct for a catalog holding only one project, where inspecting results
  cannot distinguish the query condition from the project's own tags. Older or unusual query shapes
  fall back to tags every returned project carries; legacy `newProjectTags` bindings remain readable.
- Decision: `newProjectAreaPath` and `newProjectIterationPath` place the item in the requested
  classification paths. A blank area path accepts Azure DevOps' project default; a blank iteration
  path resolves to the current Azure DevOps project's root. `projectQueryFolder` is governed by
  ADR-067.
- Decision: the type is the FIRST entry of the configured type catalog, never a setting of its own.
  The top of that list is the process's outermost type by construction, which is exactly what a
  project is here.
- Decision: title, tags, area path, and iteration path are written as ONE creation patch. The catalog
  query selects on those values, so an item created first and classified later exists for a moment as
  a row no query returns — and permanently so if the later write fails. The board is then re-read
  rather than splicing the new project in, because only the query decides what belongs to this catalog.

## ADR-070: The catalog re-ranks projects, and only under the manual ordering

- Context: the catalog is where a team decides which projects matter most, but that order lives in
  Azure DevOps' per-team backlog rank.
- Decision: a project's TITLE is the drag handle, and only top-level rows are registered — a
  project's own backlog position is what this catalog reports on, while the work beneath it is ranked
  on the board that tracks it.
- Decision: a drop always reports ADO's "no parent" sentinel as both the current and the intended
  parent. This catalog re-ranks; it never re-parents, so a drop can never restructure the tree.
- Decision: dragging is offered only under `MANUAL_ORDERING_POLICY`, exactly as on Project Tracking:
  every other policy is derived from the items themselves, so a hand-made move would be undone by the
  very next sort.
- Decision: the move is persist-then-reflect through the same serialized `WorkItemWriteQueue` the
  view's field writes use, and the list repaints only from the ranks Azure DevOps reported back —
  every reported rank, not just the moved project's, since placing one item can renumber its level.
  With no configured team the move is refused and logged rather than ranked against a guess.
