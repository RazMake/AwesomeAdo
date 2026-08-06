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
title, state, priority, assignedTo, iteration, rank/importance, eta, parent/child ids, plus whatever extra
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

Creating an item and a project's own saved **tracking query** are modelled here too: `createWorkItem`
(`IWorkItemCreator`) builds the project-scoped create endpoint and the ONE patch that gives a new item
its title, tags, area path and iteration path together; `projectQuery` (`IProjectQueryService`) owns the recursive
tree WIQL, the query naming rules, the create/delete/web URLs (with the prefix/suffix halves the page
world needs, because a created query's id exists only there), and the parse of the stamped
`Hyperlink` that identifies a tracking query. Both are their own capabilities rather than methods on
the field writer: creation has no revision to guard, and a query's lifecycle is not a field patch.
See ADR-067, ADR-068 and ADR-069.

`workItemTypes.ts` owns every derivation over the configured **type catalog** — the answers that
decide what a view shows and in which order, so no view can hold its own copy: `workItemTypeColor` /
`workItemTypeTextColor` (the `#`-prefixed hex, with an unset color reported as `null` rather than a
bare `#`), the primary-work closures (`primaryWorkTypes`, `primaryWorkWithDescendants`,
`primaryWorkAncestors`, `primaryWorkWithAncestors`), Primary-only filter candidates and recursive
hierarchy visibility (`flattenWorkItems`, `primaryFilterEligibility`,
`workItemsEligibleForPrimaryFilter`, `workItemIdsVisibleUnderPrimaryFilter`),
and `orderTrackedItems` — the ONE adapter
between a tracked item and `common/ordering`, which stays free of any ADO shape.

### `src/common/browser`

The **only** place allowed to touch `chrome.*`, plus the browser-adjacent plumbing that pairs with
it. Four groups live here:

1. **Chrome adapters** — `ChromeSyncStorage` / `ChromeLocalStorage` (the only users of
   `chrome.storage`), `ChromeAdoTabReader` / `ChromeAdoMetadataReader` (the only users of
   `chrome.tabs`), `observeStorageKeys`, `onStorageAreaChange`, `requestFromTab`, `pickAdoQueryTab`.
2. **Message contracts** — `AdoTreeRequest`, `AdoIterationsRequest`, `FeatureCrewRequest`,
   `WorkItemFieldRequest`, `WorkItemNoteRequest`, `CreateWorkItemRequest`, `ProjectQueryRequest`: the
   typed content↔background shapes plus their guards. Pure data.
3. **MAIN-world fetchers** — `fetchAdoTreeInPage`, `fetchAdoIterationsInPage`, `fetchAdoRawInPage`,
   `fetchWorkItemNotesInPage`, `writeWorkItemNoteInPage`,
   `findFeatureCrewInPage`, `applyFeatureCrewInPage`, `updateWorkItemFieldInPage`,
   `createWorkItemInPage`, `readProjectQueryLinksInPage`, `createProjectQueryInPage`,
   `removeProjectQueryInPage`. Each is
   serialized by `chrome.scripting.executeScript` and must therefore stay import-free. A config whose
   `null` MEANS something crosses that boundary through `encodeInjectedConfig` (ADR-077):
   `executeScript` drops null-valued `args` properties at any depth, so such a function's parameter
   is the encoded string it parses itself.
4. **Messaging adapters** implementing `common/ado` contracts — `MessagingWorkItemTreeLoader`,
   `MessagingWorkItemNoteLoader`, `MessagingWorkItemNoteWriter`,
   `MessagingTeamIterationsLoader`, `MessagingFeatureCrewWriter`, `MessagingWorkItemFieldWriter`,
   `MessagingWorkItemCreator`, `MessagingProjectQueryService`.

Key members:

- `observeStorageKeys` — the shared, race-safe "subscribe before reading, never let the read clobber
  a live change" protocol. Typed against `IBrowserKeyValueStorage`, so the settings store, the
  bindings store and the diagnostics log store all delegate to it (ADR-036). Returns
  `StorageObservation`.
- `requestFromTab` — the shared best-effort tab round-trip (missing receiver → a fallback value)
  both tab readers use.
- `tabRequestListener` — the ONE place the service worker's request-serving rules live: the sender's
  tab is the trust boundary (a URL is derived from it, never supplied by the content side), a
  claimed message is always answered rather than met with silence, and the message channel is held
  open only for a request actually being served. Every credentialed operation registers through it,
  so a new one cannot forget any of the three.

Known cohesion debt: groups 2 and 3 contain no `chrome.*` calls at all — they are message shapes and
ADO REST bodies. Moving them to `common/messaging` and `common/ado/in-page` is tracked as follow-up
work; it is pure file movement and was deliberately not bundled with correctness fixes.

### `src/common/settings`

`ExtensionSettings` (`theme`, `defaultView`) + `normalizeSettings`; `ISettingsStore` implemented by
`BrowserSyncSettingsStore` (one synced key per setting); `createSettingsStore()` composition
factory. `workItemTypes` carries the type→child links; `normalizeSettings` is the **only** place the
acyclic invariant is enforced (via `workItemHierarchy.reachesWorkItemType`, shared with the options
picker), because both storage reads and config import funnel through it — so no consumer walking the
hierarchy recursively has to defend against a loop. A type may also carry `isPrimaryWork: true` for
independently trackable delivery. The first/root type is always planning context, so normalization
strips that flag from it; unchecked types above primary work are planning context and unchecked types
below it are implementation details.

### `src/common/bindings`

`QueryBinding`/`QueryBindings` + `resolveActiveView` + `normalizeBindings`; `IQueryBindingStore`
implemented by `BrowserSyncQueryBindingStore` (the whole map under one synced key, with
`bind`/`unbind`/`setActiveView`/`replaceAll`); `createQueryBindingStore()` factory; `BindingRequest`
(the typed messages and extension-relative URLs for opening the options page for one query).
`IQueryBindingWriter` is the narrowed `bind`/`unbind` half `IQueryBindingStore` extends, and the only
thing an enhanced view is handed — a view that records the binding for a query it created must not
also be able to reach `replaceAll`.

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
identity reference rather than display text. `renderMarkdownField` is that field WITHOUT the
Save/Cancel pair, for a form that commits several answers with its own button (the catalog's Add
work item form); `renderTextEditor` is built on it, so the in-place editor and a form field cannot
drift apart. A key the field consumes is stopped with `stopImmediatePropagation` before any listener
the owner registered afterwards runs. Project Tracking's inline note glance and New notes activity
index omit source text beginning with configured marker `commentTag` prefixes; View all notes remains
complete. See ADR-051.

`control/SelectField` is the single themed single-select. A native `<select>` cannot be used on these
surfaces: its collapsed box takes the theme's colors, but the OPEN list is painted by the platform,
so the one part a reader looks at while choosing belongs to no theme the extension ships. Callers
exchange whole values while labels stay display-only, and each choice may carry `declarations` (how a
sprint's past/current/future emphasis reaches it) and a `title` (the full value behind a shortened
label). Per-instance `classPrefix`, like `CheckboxFilter`.

`control/ItemDetails` owns the shared `?` button paint plus Created / Last Modified / sanitized
description content. Project Tracking places that content inline; Sprint cards place it in a popup,
including compact Done cards. Sprint constrains that popup to a useful 280–380px width, wraps rich
content (including code and tables), suppresses horizontal scrolling, and caps height with vertical
scrolling.

`control/AreaPathFilter` is the shared compact full-path multi-select. Callers exchange complete ADO
area paths with it; the control alone derives shortest unique suffix labels by growing an ambiguous
leaf one parent at a time. Project Tracking offers only paths represented by descendants that survive
the resolved-age rule. Active selections use the same filled communication background and
contrasting foreground as the Project filter, plus a count badge; only an empty offered-path list
disables the trigger. Project Tracking keeps its selection in `BoardSession`, where it composes as an AND-ed
filter group without turning a transient reading position into synced configuration. Its item menu's
**Change area path** command receives that same eligible list, computes labels before omitting the
item's current path, exposes each full path as a tooltip, and persists `System.AreaPath` through the
board's shared write queue. See ADR-053.

Sprint uses the same control over represented leaf paths, but its selection is team configuration,
not reading position. Its query binding supplies default full paths only when the sprint has no saved
record; an existing record, including an empty selection, takes priority. `settings/SprintAreaPaths`
normalizes dated per-iteration records and keeps the newest ten completed records.
Options edits binding defaults through one autocomplete row per path, sourcing suggestions from the
project's complete area classification tree in `AdoMetadata`. The Add control is disabled while
blank, descriptions sit directly below it, and row actions remain adjacent to their textboxes.
When team sharing is connected, query-binding mutations publish their proposed full map before the
local store write; otherwise the local observer redraws Sprint, its mandatory pull sees the older
team payload, and `replaceAll` erases the mutation before export can read it.
Azure DevOps configuration edits follow the same publish-before-local rule through
`TeamSharedSettingsStore`; its serialized proposals prevent rapid edits from publishing sibling
snapshots derived from the same stale settings value. That rule is enforced by the type system rather
by memory (ADR-074): `ITeamPublishingSettingsStore` carries a marker a plain store lacks, the pull and
file-import paths take the segregated `LocalSettingsAccess` instead, and `createTeamSharedSettings`
is handed the plain store inline so no options-page name binds it.
Theme and default view are the exception: `PERSONAL_SETTING_KEYS` marks them as the reader's own, so
`IPersonalSettingsStore` (the disjoint `publishesBeforeWrite: false` counterpart) backs Appearance and
they are stripped from the published payload, from a pull, and from a shared query's overlay. They
still sync across the user's own devices and still travel in a file export (ADR-075).
`TeamSprintAreaPathStore` pulls before each Sprint load/refresh/switch and
serializes save-plus-publish through the connected configuration work item. Checkbox changes remain
open for multi-selection; Sprint persists each change and repaints once the popup closes by trigger,
outside pointer, or Escape. The Sprint title menu can replace the selected sprint record with the
binding defaults, disabled when none exist. See ADR-063.

`control/ActivityFilter` owns the shared recent-activity pill definitions, OR predicate, and
session-scoped newest-discussion-date index. `control/MarkerPill` owns configured-tag matching
(`markerPresence`), the pill itself, and `MarkerFilterPills` — the ONE marker filter row both views
render, differing only in which markers they offer and whether they can count them. Shared filter
pills and Project Tracking's row sprint pills use the compact Feature Crew
tag geometry; count bubbles fit inside that scale. Sprint marker tags show one total except
Interrupt, which distinguishes unaccepted work from work accepted during its current tagged
lifetime and collapses to one total when none are waiting. Every filter pill stays at full opacity, and
`renderFilterPillFamilies` separates non-activity from recent-activity pills with `6px` inside each
wrapping family and `16px` between families. Selected pills use their themed border. Both views
import these shared modules directly, preserving the eager Sprint / deferred Project Tracking bundle
split.

Item-level marker pills in both views use `marker-reasons` to pre-check Discussion notes beginning
with that marker's configured comment token. A matching result becomes a tooltip-free opener; no
match remains inert with `No notes`. Every focused row hides its configured marker token from
display while retaining the complete source. Sprint's Project hierarchy labels keep each work
item type hue while blending toward the active theme's primary foreground for readable contrast.

`control/DragReorder` owns the DOM controller, themed insertion indicator, and pure neighbour-based
placement math shared by Project Tracking rows and Sprint direct-child popups. Views register only
the rows they permit to move and retain ownership of persistence and model mutation. Project
Tracking's tree mutation (`drag-reorder/applyMoveToTree`) remains local, because only a tree has one.

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

Team sharing reuses that exact full-config schema as compact JSON through one Azure DevOps work
item's Description. ADO may return that multiline field with HTML entities even when authored as
Markdown, including entity-encoded JSON with no element wrapper. `fetchTeamConfigInPage` trusts the
raw value only when `JSON.parse` succeeds; otherwise it converts an inert HTML body's text content
back to JSON text and decodes entities before `importConfig` parses it.
The trusted work item id is persisted separately under `teamConfig.workItemId`, so downloaded JSON
cannot redirect a client to a different source. `TeamConfigSynchronizer` rejects partial remote
data, replaces both stores only when the normalized snapshot changed, and coalesces concurrent
pulls.

Export has two forms. `exportConfig` writes the whole configuration; `exportConnectionConfig` writes
`AwesomeADO.connection.config`, carrying only the connected work item id plus the organization and
project needed to reach it and marked `configScope: "connection"`. `ImportedConfig.replacesBindings`
is how a caller tells the two apart: a connection file never runs `replaceAll`, and both
`TeamConfigSynchronizer` and `SharedQueryConfigResolver` refuse it as a source. See ADR-065.

**Shared queries** are the read-only counterpart to a team connection. A saved-query URL may carry
`?awesomeAdoConfig={workItemId}` (`common/navigation/SharedQueryLink`). `SharedQueryLinkService`
asks `common/ado/TeamMembership` whether the signed-in identity is in the roster of the team that
item names: a member adopts the item as their own `teamConfig.workItemId`; a non-member — or an
undetermined answer — gets one entry in the synced `sharedQueries.workItemIds` map
(`SharedQuerySourceStore`) and nothing else changes. `SharedQueryConfigResolver` reads each work item
at most once per resolver, failed reads included, so several queries shared from one item cost one
credentialed round trip. `src/content/shared-query` applies the result per query and per navigation;
`src/options/query-bindings` renders it read-only. See ADR-064.

A successful item read with an empty Description is a neutral connected/unpublished outcome:
it neither logs an error nor changes local configuration. Content pulls on saved-query entry through
the background/MAIN-world bridge; Options pulls
or explicitly publishes through the current ADO query tab. Publish reads the current revision and
writes Description plus its Markdown format in one `/rev`-guarded JSON Patch (ADR-056).

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
- `shared-query/` — `SharedQueryController` applies a shared query link and reports the publisher's
  configuration for the query on screen; `sharedQueryOverlay` folds it over the reader's own
  settings and bindings for that one query. Logs under `content/shared-query`.
- `views/` — the concrete enhanced views, each whole in one folder (`<view>/` = `ViewType` config +
  `EnhancedView` renderer). `viewCatalog.ts` owns configs; `enhancedViewRegistry.ts` resolves eager
  and deferred renderers by id. Sprint is eager; Project Tracking is a separately built,
  web-accessible ESM module cached after first use. `shared/` holds per-view building blocks (today
  `renderViewScaffold`, `VersionLabel`). Sprint is a data-driven lane-by-state card table over flat or tree queries and loads the
  configured team's complete paged and recursively group-expanded roster before executing its tree
  on every refresh. The original
  saved WIQL loads independently and is rewritten with the selected sprint's current-iteration
  offset; results retain team-assigned or unassigned work plus their parent chains. Its first four
  configured application-state columns use quiet theme-owned neutral/blue/amber/green fills with
  high-contrast semantic titles that stay lightly tinted at rest and gain 90%-opaque themed
  backings only while pinned over scrolling cards at half the header card's resting gap below the sticky control header; area paths form
  rows whose names and per-row item counts stick vertically until the next row pushes them away. No
  table-wide total is shown. Only explicitly
  configured Primary-work types become cards; each card delegates its complete non-primary
  descendant progress and indented popup to the shared `ChildItemsBadge` on large cards only; ID and the tag-free
  shared `AssignedTo` control occupy the top corners in both card sizes, while the shared `?` details
  control and Priority chip remain available in either size. Priority is read-only while Done is
  compact and editable after expansion. The title right-click menu copies the query URL and, only for
  a past sprint, moves a confirmed snapshot of visible, assigned, non-Done Primary-work cards to a
  current/future iteration. The dialog summarizes by Lane and assignee; Lane display reuses
  `shortestUniqueAreaPathLabels` so leaves expand through parents only when they collide. The operation never widens
  beyond those IDs and atomically guards State, Area Path, and Assigned To before each iteration write.
  Card and child menus reuse Project
  Tracking commands and add Sprint-only Interrupt Tag/Accept/Clear actions; a themed inline checkbox
  previews proposed versus accepted, and acceptance opens the shared titled Markdown/mention editor.
  The Accept action stays disabled until a reason exists. ETA and child progress share
  the row below the title, aligned left and right. Assigned To and ETA are read-only while a Done card
  is compact and become editable when it expands. The shared top-right ordering picker defaults cards
  and descendant rows to backlog rank and applies title/ETA sorting to both. Child rows use shared
  completion, Assigned To and ETA controls, and title-handle sibling reorder under backlog-rank mode;
  a Done parent keeps all four read-only after expansion, and opening the popup suspends the owning card's drag
  source until every dismissal path closes it. Completion repaints explicitly close the old popup's
  document listeners and reopen the replacement; the card controller ignores bubbled child title
  drags. Parent context uses a clickable type icon/title;
  its popup lists ancestors from the root down to the immediate parent with type-derived colors and
  shared ETA controls, read-only when the owning card is Done. Cards are persist-then-reflect
  draggable only within their lane using a custom fixed 90%-opaque cursor clone that retains the
  source card's resolved background across columns, while the source card remains 90%-opaque.
  Destination cells own placement math so every pointer position, including
  inter-card gaps while reversing upward, maps to a stable slot. A dedicated border layer above the
  backdrop frames the sticky destination title using the title's semantic foreground color;
  backlog-rank mode draws an in-place shadow
  for a visible slot, while an empty destination appends last with no false insertion target. A
  cross-column positioned move prepares `System.State` through the guarded field writer and carries
  its returned rev into rank placement inside one queue action. Same-cell reorder uses an insertion
  line. Derived sorts disable reorder but not state changes; card controls
  cannot initiate a drag. Lane and Project
  options are derived only from that retained tree. Sprint changes replace the whole DOM and session,
  resetting all filters and re-deriving Lane/Project options. Its Lane filter offers only
  represented leaf area paths, excluding any represented ancestor path. Member and Unassigned pill
  counts include only Primary work, and every pill counter
  exposes its semantic label and value on hover. Its shared sprint picker
  omits the optional filter toggle, keeping the view intrinsically scoped to one sprint; Project
  Tracking retains the toggle for its broader board. **Scoped §6 exception (ADR-027):** options
  may import only `views/viewCatalog` (view config), enforced by an `import-x/no-restricted-paths`
  lint zone.
  `views/projects-view` is the many-root **All Projects Catalog View** (ADR-066). Beyond listing and
  filtering, it authors: its title menu copies the query URL and opens an inline row that creates a
  project as the FIRST configured type, tagged with `projectTag` (defaulted from the query's WIQL),
  under `newProjectAreaPath`, and in `newProjectIterationPath` (defaulted to the project root), all in
  one creation patch (ADR-069). `projectQueryFolder` overrides the catalog query's own folder for
  generated tracking queries; each row
  carries the shared Copy/Open commands, the shared item-editing commands, and tag commands that
  complete against the tree's own vocabulary while never offering to clear the tag that keeps the
  project in the query; EVERY row carries **Create Project Query** (ADR-067) and each PROJECT row
  also **Mark completed** (ADR-068). Rows are inert scan targets whose tags live only in the header's
  condition filter (ADR-072), and they share the `RowEmphasis` stripe/hover/`Ctrl+Shift+Alt`
  treatment with Project Tracking (ADR-073). Under the manual ordering a project title is a drag
  handle that re-ranks it in the team's
  backlog and never re-parents anything (ADR-070). Every write rides one serialized
  `WorkItemWriteQueue` whose status sits in the header corner.

### `src/options`

Split into component subfolders (each with its own `README.md`):

- `appearance/` — `OptionsController` + the `theme` resolver (the Appearance panel).
- `ado-config/` — `AzureDevOpsController` + `WorkItemTypesController` (which owns the ETA and
  `WorkItemHierarchyController` sections, because all three are stored on the one `workItemTypes`
  setting and a single writer keeps them in sync; the hierarchy also classifies non-root types as
  Primary work) + the reusable `AutocompleteInput` and
  `createTypeLabel`.
- `query-bindings/` — `QueryBindingsController` (bind/edit/delete query mappings).
- `settings-transfer/` — `SettingsTransferController` and `TeamConfigController` (the Appearance
  tab's unified Configuration Sharing card: file import/export plus Azure DevOps work-item sharing
  of the whole configuration, spanning both stores).
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
- **Removing one entry from a single-key synced map** lives once in `removeSyncedMapEntry`, shared by
  the bindings store and the shared-query source store, so the "nothing to remove, so write nothing"
  short-circuit that keeps a no-op from emitting a change event cannot drift between them.
- **Narrowing a raw ADO JSON value** lives once in `common/ado/rawJson` (`asRecord`,
  `nonEmptyString`), so no two parsers can disagree about whether `""` is an answer.
- **"Who am I to Azure DevOps?"** lives once in `common/ado/currentUser` (the `ConnectionData` URL
  and the identity parse), used by both note editing and team-membership checks.
- **One credentialed page GET in the sender's tab** lives once in the worker's `readInPage`, so every
  read-only operation shares one injection shape and one "injection produced nothing" outcome.
- **Serving a content-side request in the worker** lives once in `tabRequestListener`: the sender's
  tab as the trust boundary, always answering a claimed message, and holding the channel open. Every
  credentialed operation in `background/index.ts` registers through it.
- **What "completed" means for an item** lives once in `ProjectLifecycleCommands.completionStateOf`
  (the primary state of the type's LAST configured board column), shared by the catalog's rows and
  Project Tracking's title — so the word cannot mean one state on one surface and another next door.
- **Which saved query is a project's tracking query** lives once in `common/ado/projectQuery`: a
  `Hyperlink` stamped with `PROJECT_QUERY_LINK_COMMENT` whose URL still resolves to a single query.
  The link's relation INDEX is deliberately not modelled — the worker locates it immediately before
  removing it, because an index read earlier is exactly what a concurrent edit invalidates.
- **ISO timestamp → epoch milliseconds** lives once in `common/datetime/isoEpoch`, so "no timestamp"
  cannot mean `NaN` in one comparator and `0` in the next.
- **Type-catalog derivations** (a type's color, which types are primary work / its ancestors / its
  descendants, and how an item is adapted to an ordering policy) live once in
  `common/ado/workItemTypes`, shared by both views.
- **Filter pills a view shares** are one control each, configured per view rather than re-rendered:
  `MarkerPill/MarkerFilterPills` (Sprint supplies counts, Project Tracking does not),
  `ActivityFilter/ActivityFilterPanel`, `AreaPathFilter`, `SprintPicker`, `OrderingPicker`,
  `WriteQueueStatus`, `DragReorder`. Views own their own selection state; the controls stay
  stateless about it.
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
- The always-loaded content runtime excludes Project Tracking's renderer. Store builds minify both
  artifacts; the renderer is imported only after a bound Project Tracking request and cached for the
  tab session. The surface leaves ADO visible while it loads and ignores stale resolutions.
- Project Tracking keeps note-panel and recent-note data in `BoardSession`, not replaceable row DOM;
  refresh prunes ids absent from the new tree. Tree hydration reads 200-id pages with four lanes and
  retries transient failures at most three times.
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
priority, rank/importance, eta, parent/child ids`; per-view fields grow as views are built. All ADO field
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

#### Every write must leave the item's rev current (non-negotiable)

Every patch this extension sends is guarded by `{ op: "test", path: "/rev" }`, so an item whose
cached `rev` was not moved on has **every** later write on it refused with `HTTP 412` until the board
is reloaded. The failure never surfaces where it was caused: it lands on the _next_, unrelated edit.

Therefore, when adding or reviewing **any** operation that changes a work item — a field patch, a
comment, a reorder, a re-parent, a rank write, a batch write, a new REST call — answer both questions
before it ships:

1. **Does this bump `System.Rev`?** Assume yes for anything that touches an item. A discussion note
   does, even though it goes through the comments API; a reorder does, even though it carries no rev.
2. **Does the new rev get back onto the model?** If the API reports one, fold it (`item.rev =
result.rev`). If it does **not** report one (comments, `workitemsorder`), **re-read the item** and
   report the rev back to whoever owns it — do not leave the caller holding a value it cannot know is
   stale.

`baseValue` is a safety net for a rev that drifted for reasons we do not control (someone editing in
ADO's own tab), **not** a substitute for this: it licenses exactly one rebase, only for a change
derived from the field's current value, and only while that field is unchanged.

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

### 13. Every control follows the selected AwesomeADO theme (non-negotiable)

**Every** UI control an enhanced view renders — badges, pills, buttons, twisties, dropdowns, popups,
panels, the status control, the sprint picker, expand/collapse affordances — MUST follow the selected
AwesomeADO theme (Dark / Light / Blue). `Follow Azure DevOps` detects only ADO's dark/light polarity
and resolves it to AwesomeADO's matching concrete theme; Blue is manual. No fixed presentation or
semantic color may live in a consumer.

- Theme definitions live independently in `common/view-common/themes/<name>Theme.ts` and satisfy one
  complete CSS-variable contract. `themes.ts` is the only concrete-theme registry; settings values,
  the options selector, options colors, and the enhanced-view host derive from it.
- Consumers read only CSS roles from that complete contract, without literal color fallbacks. The
  enhanced-view host pins every role; Options consumes the same definition, so the surfaces cannot
  drift. ADO/data-derived hues remain runtime inputs, but every fixed blend endpoint and frame is a
  theme role.
- Status colors are keyed by global board-column ordinal and use theme-owned, muted background,
  border, and terminal-foreground roles.
- Decorative lines/guides (e.g. the child-indent guide) use a **discrete, theme-derived neutral**
  (low-alpha `currentColor` or a neutral palette token), never a fixed grey.

New reusable, theme-aware controls live under `src/common/view-common/control/<Control>/` — the sole
DOM-bearing code allowed under `common/` (AGENTS.md §11) — so every view shares one correctly-themed
implementation instead of re-inlining light-only styles. This is a standing review gate: a control
that hard-codes a fixed non-theme color is a defect, not a style nit. The injected top-bar BUTTON is
the exception: it consumes ADO's own tokens because it belongs to ADO's command bar. Its popup menu
is an AwesomeADO surface; because it mounts outside the themed overlay, `BindingMenu` pins the
selected concrete palette directly onto the popup.
