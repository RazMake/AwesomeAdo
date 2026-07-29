# System Patterns

## Layer Map

Runtime code lives under `src/`, split so that all browser APIs are isolated and every feature
depends on abstractions.

```
src/common/browser/    chrome API isolation + shared browser-layer helpers
src/common/ado/        ADO REST field defs + the normalized work-item data model (all views)
src/common/settings/   the theme / default-view settings model + synced store
src/common/bindings/   the per-query binding model, view catalog, synced store, open-page contract
src/common/navigation/ ADO host/route/identity parsing + navigation and probe message contracts
src/content/           the content script, split into feature subfolders (query-page, query-binding, ado-probe)
src/options/           the options page, split into feature subfolders (appearance, ado-config, query-bindings, diagnostics, alerts, shell)
src/background/        the service worker (SPA navigation forwarding + opening extension pages)
scripts/               build + release automation (never bundled into the extension)
```

### `src/common/ado`

The chrome-free ADO REST layer: the URL builders and response parsers, and — going forward — the
**normalized work-item data model** every enhanced view consumes (a common core of id, rev, type,
title, state, assignedTo, iteration, rank/importance, eta, parent/child ids, plus whatever extra
fields a specific view declares it needs), **decoupled from raw ADO JSON** by a parse layer like the
metadata parsing today. **All ADO field definitions and data shapes live here** — never in
`src/common/view-common`, which is for common view UX (menus, reusable components, the view
contracts). The exact field list grows as views are implemented (it depends on each view's functionality); only the common core is shared. Today the
folder holds the options-page project metadata (`AdoMetadata`, `buildAdoMetadataUrls`, the parsers).

A work item's **notes** are modelled here too: `WorkItemNote` (id, author, createdDate, the Markdown
source AND ADO's own rendering) plus the pure windowing rules — `noteWindowStart`,
`sortNotesNewestFirst`, `selectRecentNoteDays`, `isOwnNote` — with the URL builders and parsers in
`fetchWorkItemNotes` and the `IWorkItemNoteLoader` / `IWorkItemNoteWriter` contracts split apart
(Interface Segregation: showing notes and authoring them are different capabilities). See ADR-043.

### `src/common/browser`

The **only** place allowed to touch `chrome.*`, plus the browser-adjacent plumbing that pairs with
it. Four groups live here:

1. **Chrome adapters** — `ChromeSyncStorage` / `ChromeLocalStorage` (the only users of
   `chrome.storage`), `ChromeAdoTabReader` / `ChromeAdoMetadataReader` (the only users of
   `chrome.tabs`), `observeStorageKeys`, `onStorageAreaChange`, `requestFromTab`, `pickAdoQueryTab`.
2. **Message contracts** — `AdoTreeRequest`, `AdoIterationsRequest`, `FeatureCrewRequest`,
   `WorkItemFieldRequest`, `WorkItemNoteRequest`: the typed content↔background shapes plus their
   guards. Pure data.
3. **MAIN-world fetchers** — `fetchAdoTreeInPage`, `fetchAdoIterationsInPage`, `fetchAdoRawInPage`,
   `fetchWorkItemNotesInPage`, `writeWorkItemNoteInPage`,
   `findFeatureCrewInPage`, `applyFeatureCrewInPage`, `updateWorkItemFieldInPage`. Each is
   serialized by `chrome.scripting.executeScript` and must therefore stay import-free.
4. **Messaging adapters** implementing `common/ado` contracts — `MessagingWorkItemTreeLoader`,
   `MessagingWorkItemNoteLoader`, `MessagingWorkItemNoteWriter`,
   `MessagingTeamIterationsLoader`, `MessagingFeatureCrewWriter`, `MessagingWorkItemFieldWriter`.

Key members:

- `observeStorageKeys` — the shared, race-safe "subscribe before reading, never let the read clobber
  a live change" protocol. Typed against `IBrowserKeyValueStorage`, so the settings store, the
  bindings store and the diagnostics log store all delegate to it (ADR-036). Returns
  `StorageObservation`.
- `requestFromTab` — the shared best-effort tab round-trip (missing receiver → a fallback value)
  both tab readers use.

Known cohesion debt: groups 2 and 3 contain no `chrome.*` calls at all — they are message shapes and
ADO REST bodies. Moving them to `common/messaging` and `common/ado/in-page` is tracked as follow-up
work; it is pure file movement and was deliberately not bundled with correctness fixes.

### `src/common/settings`

`ExtensionSettings` (`theme`, `defaultView`) + `normalizeSettings`; `ISettingsStore` implemented by
`BrowserSyncSettingsStore` (one synced key per setting); `createSettingsStore()` composition
factory. `workItemTypes` carries the type→child links; `normalizeSettings` is the **only** place the
acyclic invariant is enforced (via `workItemHierarchy.reachesWorkItemType`, shared with the options
picker), because both storage reads and config import funnel through it — so no consumer walking the
hierarchy recursively has to defend against a loop.

### `src/common/bindings`

`QueryBinding`/`QueryBindings` + `resolveActiveView` + `normalizeBindings`; `IQueryBindingStore`
implemented by `BrowserSyncQueryBindingStore` (the whole map under one synced key, with
`bind`/`unbind`/`setActiveView`/`replaceAll`); `createQueryBindingStore()` factory; `BindingRequest`
(the typed messages and extension-relative URLs for opening the options page for one query).

### `src/common/view-common`

The pure view **contracts** both bundles depend on (Dependency Inversion, no DOM/chrome): `ViewType`
(shape + value helpers) and `EnhancedView`/`EnhancedViewContext`. The concrete views (catalog,
registry, renderers) live under `src/content/views` — see the `src/content` section. Keeping only the
abstractions here is ordinary DIP, not a §6 exception. Its scope is **common view UX** — the shared
view contracts today, plus reusable cross-view UX building blocks (menus, shared components) as they
arrive. It must **never** hold ADO data shapes or field definitions; those live in `src/common/ado`.

`control/MarkdownText` is the single place author-written content is turned into DOM (descriptions
and every discussion note). Nothing there ever assigns to `innerHTML` on the live document: the
source is parsed into an inert document and rebuilt node by node against an allowlist, which is what
makes passing ADO's raw rich-text HTML through safe. See ADR-044.

`control/TextEditor` is the single multi-line Markdown authoring surface. It owns bold/italic/link
caret transforms and the optional directory-backed `@` suggestion flow, inserting ADO's local
identity reference rather than display text. Project Tracking's inline note glance and New notes
activity index omit source text beginning with configured marker `commentTag` prefixes; View all
notes remains complete. See ADR-051.

### `src/common/ordering`

`ItemOrdering` — the single definition of what "most important first" / "a–z" / "by ETA" mean:
the `OrderingPolicy` union, the `ORDERING_POLICIES` picker list (first entry =
`DEFAULT_ORDERING_POLICY`), the minimal `OrderableItem` sort-key contract, and `orderItems` (a
non-mutating stable sort). Pure and domain-free on purpose — it holds no ADO shape, so callers adapt
their own items to `OrderableItem` (Project Tracking wraps each `TrackedWorkItem`, converting the ISO
ETA to epoch ms) instead of the contract growing a field per consumer. A view reads the policy from
its binding through the view-config reader (`orderingPolicyOf`), never straight out of `properties`,
so a policy a build no longer offers falls back rather than reaching a comparator. See the
`add-ordering-policy` skill.

### `src/common/settings-transfer`

`AwesomeAdoConfig` — `exportConfig`/`importConfig` (+ `CONFIG_FILE_NAME`) serialize the whole
configuration (all settings + every binding) to/from an `AwesomeADO.config` file, normalizing on the
way in and out. Pure data plumbing; the options-side wiring lives in `src/options/settings-transfer`.

An import is **salvaging, not all-or-nothing**: `importConfig` returns
`{ settings: Partial<ExtensionSettings>, enhancedQueries, problems }`, applying every value the file
supplies usably and describing each one it does not in `problems`. The partial is the point — a
setting the file omits (older export) or gets wrong keeps the user's current value instead of being
reset to a default the file never asked for. `ConfigImportError` is thrown only when the file yields
nothing at all (unparseable / missing a whole section), because an import replaces both stores
wholesale. A non-empty `problems` list is treated by the caller as a **failure**: logged and shown in
red, never a footnote under a success message. This is the one place normalization is deliberately
NOT silent — the normalizers repair storage so a running extension is never stopped by a stale
value, but an import is the user's own file, which they can fix.

### `src/common/navigation`

- `AdoHost` — the single source of truth for "which URLs are hosted ADO": `isSupportedAdoHost`, the
  `.visualstudio.com` suffix, and `ADO_HOST_MATCH_PATTERNS` (mirrored by the manifest, pinned by a
  test).
- `AdoQueryRoute` — the `AdoNavigationMessage` contract, `isAdoQueryUrl`, and `parseAdoQueryId`
  (the strict single-query GUID parse bindings key off).
- `AdoContext` — org/project identity parsing plus the theme and query-name request/response message
  contracts the options page uses to interrogate a live ADO tab.
- `NavigationNotifier` — `notifyNavigation`, which forwards top-frame navigations to the content
  script.

### `src/content`

Split into component subfolders (each with its own `README.md`):

- `query-page/` — `QueryPageController` + `EnhancedViewSurface` decide whether the current route
  should be enhanced and, when it should, mount the bound view's DOM (resolved through the
  enhanced-view registry) in place of ADO's page, reversibly restoring it otherwise. Logs under
  `content/query-page`.
- `query-binding/` — `QueryBindingController` + `BindingButton` + `BindingMenu` own the top-bar
  button's visibility policy and the menu it opens. Logs under `content/query-binding`.
- `ado-probe/` — `AdoThemeProbe` / `AdoQueryNameProbe` read the rendered theme / query name from the
  DOM, only when the options page asks for them.
- `views/` — the concrete enhanced views, each whole in one folder (`<view>/` = `ViewType` config +
  `EnhancedView` renderer). `viewCatalog.ts` (configs) and `enhancedViewRegistry.ts` (renderers)
  mirror each other in order; `shared/` holds per-view building blocks (today `renderViewScaffold`);
  `sprint` and `project-tracking` are the reference views. **Scoped §6 exception (ADR-027):** options
  may import only `views/viewCatalog` (view config), enforced by an `import-x/no-restricted-paths`
  lint zone.

### `src/options`

Split into component subfolders (each with its own `README.md`):

- `appearance/` — `OptionsController` + the `theme` resolver (the Appearance panel).
- `ado-config/` — `AzureDevOpsController` + `WorkItemTypesController` (which owns the ETA and
  `WorkItemHierarchyController` sections, because all three are stored on the one `workItemTypes`
  setting and a single writer keeps them in sync) + the reusable `AutocompleteInput` and
  `createTypeLabel`.
- `query-bindings/` — `QueryBindingsController` (bind/edit/delete query mappings).
- `settings-transfer/` — `SettingsTransferController` (Appearance-tab import/export of the whole
  configuration, spanning both stores).
- `diagnostics/` — `DiagnosticsController` + the reusable `MultiSelectFilter` (never logs — it renders
  the store it observes).
- `alerts/` — `StatusReporter` (logs under `options/alerts`) + `ConfigurationBannerController`.
- `shell/` — `TabsController` (page tab navigation).

## Composition Roots (excluded from coverage)

These files contain only construction/wiring — the one place concrete chrome-backed objects are
built and injected. They are excluded from coverage thresholds and validated by loading the
extension in a real browser.

| File                                             | Wires                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/background/index.ts`                        | `chrome.webNavigation` → `notifyNavigation`; open-page messages → `chrome.tabs` |
| `src/content/index.ts`                           | both stores + navigation/probe messages → the content controllers               |
| `src/options/index.ts`                           | both stores + tab readers → the options controllers                             |
| `src/common/settings/createSettingsStore.ts`     | `ChromeSyncStorage` + `BrowserSyncSettingsStore`                                |
| `src/common/bindings/createQueryBindingStore.ts` | `ChromeSyncStorage` + `BrowserSyncQueryBindingStore`                            |

## Single-Source-of-Truth Rules

- **Synced-storage observation** lives once in `observeStorageKeys`. The settings store, the bindings
  store and the diagnostics log store all delegate to it, so the subtle race logic cannot drift
  between them (ADR-036).
- **The ADO REST API version** lives once in `common/ado/adoApi.ts` (`ADO_API_VERSION`); every URL
  builder derives from it, so a read and the write beside it cannot target different API versions.
- **"Which URLs are ADO"** lives once in `AdoHost` (predicate + match patterns). The route parser,
  the identity parser, and both tab readers all derive from it; the manifest globs are pinned to it
  by `AdoHost.test.ts`.
- **The bindings-map read-modify-write** lives only in `BrowserSyncQueryBindingStore`
  (`bind`/`unbind`/`setActiveView`/`replaceAll`); the content script forwards intent instead of
  re-deriving it.
- **The effective per-query view** is resolved only by `resolveActiveView`, shared by the content
  enhanced-view surface and the top-bar menu so they always agree.
- **The default view** is read from `DEFAULT_SETTINGS`, never re-hardcoded.

## SOLID Mapping

- **S** — Each class has one reason to change (e.g. `ChromeSyncStorage` only talks to storage;
  `EnhancedViewSurface` only mounts/restores the view DOM; `QueryBindingController` only owns
  button/menu policy).
- **O** — Consumers depend on interfaces (`ISettingsStore`, `IQueryBindingStore`,
  `IBrowserSyncStorage`, `IAdoTabReader`, `IAdoQueryTabsReader`); new backends or views are added
  without editing consumers (a new view is one `VIEW_TYPES` entry plus one `ENHANCED_VIEWS` entry).
- **L** — Any interface implementation (real chrome-backed or a test fake) is interchangeable.
- **I** — Interfaces stay small and focused; storage, settings, bindings, and tab-reading contracts
  are separate.
- **D** — Feature code depends only on abstractions; concretes are injected only at the composition
  roots above.

## Performance Posture

- Host-wide injection on `dev.azure.com`/`*.visualstudio.com` is required to catch ADO's SPA
  navigation into and out of Query routes within one tab.
- To stay light on non-query pages, all heavy work is gated behind a parsed query id:
  `EnhancedViewSurface` mounts only when `QueryPageController.shouldEnhance()` is true, and
  `BindingButton`'s `MutationObserver` is created only when `QueryBindingController` sees a query id.
  The probes run only on request from the options page.
- The only always-on cost on any ADO page is the two synced-storage observers and the one runtime
  message listener the content script wires. See ADR-020.

## Enhanced View Runtime Principles

These principles govern how **every** enhanced view reads, mutates, and presents ADO data at
runtime. They are a standing contract applied to each view's implementation — not one-time setup.
They are being built incrementally: today's views are placeholder shells, so most of what follows is
the **target** design new view work must conform to.

### 1. Server is the only source of truth

There is no live shared data between an enhanced view and ADO's own grid — they run in different JS
worlds (isolated vs. MAIN) and never share a heap. Each side is an **eventually-consistent cache** of
the ADO server; all coupling flows through the server. (Principle 3 of "shared in-page data" was
evaluated and dropped as unachievable.)

### 2. Credentialed ADO REST runs through a MAIN-world bridge (closed op-set)

A content script cannot call `chrome.scripting`, so all credentialed reads/writes go through a
manifest `world:"MAIN"` bridge content script that owns the fetcher. Security is non-negotiable: a
**per-session nonce** shared only between our isolated content script and the bridge, strict
`event.origin` **and** `event.source` checks, a **closed operation vocabulary** (never a generic
"fetch any URL" proxy — that would let a malicious page exfiltrate via our session), responses
returned only to us, and **never log field values or identity**.

### 3. Reads

- Each view **declares its data needs** (fields + relation needs); a shared loader resolves the
  minimum set of paged/cached batches. Fetch strategy lives in one place, not in each view.
- **Extra fields are free**: the saved query's column set does not limit what we fetch — union the
  view's needed fields into the `workitemsbatch` call (page 200s to the end).
- **Parents** (upward hydration) are bounded and cheap — allowed from flat queries.
- **Downward hierarchy is supported two ways**: a **tree (work-item-links) query**, and
  **flat + lazy** descendant loading (depth/item-capped, expanded on demand per node, cached by
  `id:rev`). Descendants pulled beyond the query are surfaced as such.
- **Refresh** on mount, on manual request, and after the write queue drains. No background polling.

### 4. Normalized data model in `common/ado`

Views consume one normalized work-item shape **decoupled from raw ADO JSON** by a parse layer (like
the metadata parsing today). Common core: `id, rev, type, title, state, assignedTo, iteration,
rank/importance, eta, parent/child ids`; per-view fields grow as views are built. All ADO field
definitions and data shapes live in `common/ado`; `common/view-common` is UX only.

### 5. Fluid optimistic writes via a per-tab sequential queue

- A change updates the in-memory model **immediately** and enqueues a write; the queue executes
  **strictly sequentially, globally**.
- Initial op vocabulary (grows per view): read props, set props (multiple props in one op = one
  queue entry/one undo unit), read comment, add comment, update comment, reorder (ADO reorder API).
- **Coalesce** rapid successive ops on the same target.
- **Read back** the changed properties after each committed write to reconcile the optimistic model
  against server-side rule effects.
- Track `System.Rev` per item for optimistic concurrency.

### 6. Undo

In-memory, **one stack per query, single-level**; a reload destroys it. Cancel-or-compensate: if the
write is still queued, remove it; if it is executing/committed, enqueue a compensating write, then
update the model. A **reorder inverse snapshots the prior neighbor** at enqueue time. **Redo** exists
only for specific **view-declared** ops, not every write. There is **no compensation for rule-driven
field changes** — reconcile via read-back and surface if the inverse cannot apply.

### 7. Errors & conflicts

Optimistic UI **rolls back** on failure. **All** errors surface in a **themed top panel** and are
logged. Retry policy (no dead-letter; the user retries later):

- **Transient** (network, 5xx, timeout) → auto-retry with backoff, then surface.
- **Conflict** (409/412 stale rev) → roll back + surface ("item changed — reload to see latest"); **no
  blind retry, no auto-rebase** (it would silently overwrite a concurrent change).
- **Permission / not-found** (403/404) → surface immediately, no retry.

### 8. Queue durability & lifecycle

Per-tab, in-memory (two tabs on the same query keep **separate** queues). Leaving with pending writes
— page unload **and** ADO SPA-navigation away from the query — triggers a **themed guard** warning
that changes will be lost; they are discarded only on confirmation.

### 9. View switching & the tab-local override

- Switching **to the enhanced view** re-fetches our own DOM (no page reload). Switching **to ADO's
  standard grid** may reload the page to force ADO to re-fetch.
- A per-query **freshness token** (bumped by committed writes and by reads that observe a new
  `id:rev` set) decides the reload: on switch-to-standard, reload **iff** the token advanced since
  load; otherwise restore ADO's grid in place. The token is in-memory and does not survive a reload.
- The **switch menu is disabled while writes are pending** (a reload would lose them). A permanent
  write failure rolls back + dequeues, which re-enables switching.
- A **tab-local view override** lives in the ADO page's `sessionStorage`. Precedence:
  **override › per-query configured default (synced) › global default**. The frequent toggle writes
  **only** the tab-local override (never the synced default); a separate explicit "make this my
  default" action writes the synced default, which takes effect only on the **next navigation** to
  the query. **F5 keeps** the override. Menu checkmarks reflect the **effective** view.

### 10. Queue indicator

A pending-count indicator with in-flight and failed/retry states. It need **not** survive the
enhanced↔standard toggle (that reloads/re-fetches anyway).

### 11. Observability (AGENTS.md §9)

Log, flip-deduped and sourced to the owning folder: query load (counts / success / failure), each
write enqueue / commit / conflict / permanent-fail / rollback, queue drain start & empty, undo, the
switch decision (reload-or-not + freshness reason), session expiry, and override reads.

### 12. Testing

Deterministic unit tests with injected fakes (≥ 85%) for: queue ordering / retry / coalesce, undo,
the freshness token, override precedence, data-requirements → batch planning, and the parse/normalize
layer. The MAIN-world bridge and real ADO reads/writes are composition-root/browser-validated
(coverage-excluded).

### 13. Every control follows the ADO theme (non-negotiable)

**Every** UI control an enhanced view renders — badges, pills, buttons, twisties, dropdowns, popups,
panels, the status control, the sprint picker, expand/collapse affordances — MUST follow the account's
active ADO theme (light / dark / blue / high-contrast). No control may hard-code a light-only palette
(`#fff` backgrounds, `#333`/`#666` text, `#ddd` borders as the _only_ value): those wash out or turn
invisible on the dark theme. Concretely:

- Style from ADO's theme CSS custom properties with a hard fallback, never a bare literal: surfaces use
  `var(--callout-background-color, var(--background-color, #fff))` / `var(--background-color, …)`, text
  uses `var(--text-primary-color, …)` / `var(--text-secondary-color, …)`, and borders/separators use a
  neutral token such as `var(--palette-neutral-20, …)` /
  `var(--component-menu-separator-color, rgba(128,128,128,0.35))`. Follow the tokens already proven in
  `BindingMenu`, `AssignedTo`, and `EnhancedViewSurface`.
- A control that encodes a **status/state color** (the work-item state control) derives the hue from the
  ADO state color but renders it **muted/discrete** (low-alpha tint over the themed surface, not a solid
  fill) so it reads on any theme and never fights the page.
- Decorative lines/guides (e.g. the child-indent guide) use a **discrete, theme-derived neutral**
  (low-alpha `currentColor` or a neutral palette token), never a fixed grey.

New reusable, theme-aware controls live under `src/common/view-common/control/<Control>/` — the sole
DOM-bearing code allowed under `common/` (AGENTS.md §11) — so every view shares one correctly-themed
implementation instead of re-inlining light-only styles. This is a standing review gate: a control
that hard-codes non-theme colors is a defect, not a style nit.
