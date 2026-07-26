# Debugging Notes

Source-controlled, portable record of hard-won tactical knowledge about this codebase: root-cause
findings, non-obvious gotchas, live-debugging recipes, and workflow quirks. Unlike `systemPatterns.md`
(the curated architecture + rationale), this file is the running "lab notebook" — the specific bugs
we hit, why they happened, and the exact fix so nobody re-derives them.

**This is the single source of truth for these notes.** Do not keep durable repo knowledge in any
agent-tool-local memory (it does not clone or transfer between machines/agents). Record new findings
here so every agent, teammate, and clone sees them.

## Terminology (per developer, use consistently)

- "Status" / "State" (of an item) = the APPLICATION board-column label (In Queue/In Progress/Waiting/
  Done/Removed) that the item is mapped onto. This is what the UI DISPLAYS.
- BOARD COLUMNS ARE A FIXED SET of `BOARD_COLUMN_COUNT` (5): `DEFAULT_BOARD_COLUMNS` = In Queue/In
  Progress/Waiting/Done/Removed. Titles are RENAME-ONLY (no add/remove). `normalizeBoardColumns`
  positionally coerces stored value to exactly 5 (keeps stored title per index, else default; a
  case-insensitive collision with an earlier index falls back to that index's default).
  `MAX_BOARD_COLUMNS` + add/delete-column UI were REMOVED. `isAdoConfigured` no longer checks
  `boardColumns` (always present). `StatusBadge` returns a `StatusBadgeHandle` with
  `setStatus(state, ordinal)` so a committed move re-tints in place (`applyColors` extracted).
- "ADO State" / "ADO Status" = the raw `System.State` value from Azure DevOps. Mapped onto a board
  column via `TrackedTypeColumn.states[]`; `states[0]` is the PRIMARY ADO state written back for a
  column.
- `StatusBadge` control DISPLAYS the mapped column (Status), NOT the raw ADO State. `onChange` writes
  the chosen column's primary ADO State.

## RULE: every enhanced-view control follows the ADO theme (ADR-034 / systemPatterns #13)

- NON-NEGOTIABLE. No control may hard-code a light-only palette (`#fff` bg, `#333`/`#666` text,
  `#ddd`-only borders). Style from ADO theme CSS vars WITH a literal fallback: surfaces
  `var(--callout-background-color, var(--background-color, #fff))`; text `var(--text-primary-color,…)`
  / `var(--text-secondary-color,…)`; borders `var(--palette-neutral-20,…)` /
  `var(--component-menu-separator-color, rgba(128,128,128,0.35))`. Mirror
  `BindingMenu`/`AssignedTo`/`EnhancedViewSurface` tokens. Status/state color = MUTED low-alpha tint
  over themed surface (not solid fill). Decorative guide lines = discrete theme-derived neutral.
  Reusable theme-aware controls live in `src/common/view-common/control/<Control>/` (sole DOM allowed
  under `common/`, AGENTS.md §11).

## Extension THEME (options: auto/light/dark/blue) re-themes the WHOLE enhanced view + controls

- HOW it works (DRY, zero per-control change): controls already read ADO token names
  (`var(--text-primary-color,…)` etc.). `src/common/view-common/theme/viewTheme.ts` defines full-color
  palettes for light/dark/blue UNDER THOSE SAME ADO TOKEN NAMES (`VIEW_THEME_VARIABLES` list) +
  `resolveViewThemePalette(theme)`→palette|null (null = "auto"/Follow ADO). `EnhancedViewSurface.applyTheme(theme)`
  PINS those tokens on the HOST overlay element via `host.style.setProperty` (or `removeProperty`
  for auto) so they win over ADO's inherited tokens for the view subtree ONLY — ADO's surviving chrome
  (breadcrumb bar, left rail) keeps ADO's theme. `applyThemeToHost()` is re-called from `ensureHost()`
  every mount because cssText (`HOST_OVERLAY_CSS`) is only assigned on host CREATE, so a re-attach
  after ADO redraws would otherwise lose the custom props. host bg = `var(--background-color,#fff)`
  resolves to the pinned value on the same element. `QueryPageController.applySettings` forwards
  `settings.theme` via `surface.applyTheme(theme)` EVERY settings change (a theme flip re-themes the
  open view WITHOUT rebuild; `applyTheme` does not touch signature/DOM). Test surface spies MUST add
  `applyTheme: vi.fn()`.
- Scope decision: `BindingMenu`/`BindingButton` (ADO top bar) intentionally still follow ADO (they
  live in ADO's header context). Only the enhanced-view overlay + its controls take the extension theme.

## Layer convention (views feature)

- ADO field definitions + the normalized work-item data model (decoupled from raw ADO JSON) live in
  `src/common/ado`. `src/common/view-common` = common view UX (menus, reusable components) + the
  `ViewType`/`EnhancedView` contracts — NEVER ADO data shapes/fields. Common core fields: id, rev,
  type, title, state, assignedTo, iteration, rank/importance, eta, parent/child ids; per-view extra
  fields grow as views are implemented. Recorded in `.agents/memory-bank/systemPatterns.md`.

## Extension icon / injected button image

- Canonical icon source: `src/icons/icon.svg` (blue circle + work-item card + green check + gold sparkle).
- Manifest `icons` and `action.default_icon` MUST be raster PNG — Chrome/Edge do NOT accept SVG there.
  PNGs (16/32/48/128) live in `src/icons/` and are regenerated FROM icon.svg with `@resvg/resvg-js`
  (fitTo width). Generate in a throwaway temp project so the repo `package.json`/lockfile stay clean.
- `build.mjs` `copyStatic` already copies `src/icons/* -> dist/icons/` when the folder exists.
- The content-script `BindingButton` renders an `<img>` whose src is
  `chrome.runtime.getURL("icons/icon.svg")`. icon.svg is listed in manifest `web_accessible_resources`
  (matched to the ADO hosts). Content-script loads of web-accessible resources bypass the ADO page CSP,
  so no data-URI/inline-SVG needed.
- `BindingButton` stays chrome-free: the icon URL + label are injected by the composition root
  (`src/content/index.ts`). label is used as title/aria-label/alt, not visible text.
- `BindingButton` PLACEMENT (current): prepend into ADO's top-bar command menubar so it groups with
  ADO's native command icons AND shares the container that paints the header's bottom hairline.
  `findMenubar` = `headerRow.querySelector('.region-header-menubar,[role="menubar"]')` scoped to
  `findSearchBox().closest('[role="navigation"]').parentElement`, else global. Fallbacks: after the
  nav region ending with the search box, then fixed top-right overlay.
- CRITICAL "interrupted line" bug: each header section (region-header nav AND region-header-menubar)
  paints its OWN 1px bottom divider via `box-shadow: rgba(255,255,255,0.08) 0 1px 0 0` (dark theme).
  A button inserted as a BARE header-row child BETWEEN nav and menubar is shorter (32px vs 48px row,
  centered) and carries no line, leaving a horizontal GAP in that continuous underline. FIX = put
  the button INSIDE the menubar (the container draws the line across the full width incl. our button)
  — do NOT try to replicate the hairline (its color is theme-specific). Verified live: parent becomes
  `role="menubar"` region-header-menubar, button is firstElementChild, x~~774 y~~8 32x32, line unbroken.
- `findSearchBox` tries `[role="search"]` (div.flex-cell.search "Project-wide search"), then
  `input[aria-label^="Search" i]` / `input[placeholder^="Search" i]` (#l1-search-input). Do NOT insert
  next to the search box itself — ADO wraps it in `.expandable-search-header` sized to the input, so a
  sibling gets squeezed ON TOP of the input.
- STYLE like ADO's native command buttons (bolt-button bolt-icon-button subtle): 32px square,
  padding ~6-8px, border-radius:2px (NOT 50%/circle), transparent bg, NO drop-shadow, subtle hover.
  Native icons are MONOCHROME (currentColor, white on dark theme); our brand icon stays COLORED so
  it visibly stands out among them — flattening it to monochrome would need a new line-glyph asset.
- `styleAsInline`: flex:0 0 auto; align-self:center; margin:0 (flush with native buttons). Overlay
  fallback (`styleAsOverlay`) floats top-right and previously OVERLAPPED the profile avatar when the
  search box wasn't ready at show() time — menubar placement loads earlier and avoids that. Both
  placements stay outside `[role="main"]` so they survive Enhanced View blanking.
- CRITICAL: ADO re-renders its header (framework/Bolt tree) DURING and shortly after load and
  silently DROPS foreign injected nodes. A one-time insertion INTERMITTENTLY disappears ("button
  does not show up"). Fix = MutationObserver (`keepPlaced`) on `doc.documentElement` {childList,subtree}
  that re-runs `place(button)` whenever `this.button && !this.button.isConnected`. `hide()` must
  `observer.disconnect()` FIRST. Verified live: button re-attaches <100ms after removal, survives
  repeated removals. Tests: `afterEach(button.hide())` to stop observers leaking across tests +
  `flushMutations = setTimeout(0)` to let MO callbacks run.
- BUTTON OPENS A POPUP MENU (not a direct options jump). Button shows on ANY single-query route
  (bound OR unbound), hidden elsewhere. Click toggles `src/content/BindingMenu.ts` (transient popup,
  position:fixed, z-index 2147483647, right-edge aligned to button, top=rect.bottom+4). Menu dismiss:
  outside pointerdown (capture; IGNORES clicks on anchor so the button's own handler toggles without a
  close/reopen race), Escape, resize/scroll reposition. No persistence observer (unlike the button).
- `BindingButton.show(onClick)` passes the button element as the anchor: `show((anchor)=>...)`.
- `QueryBindingController`: ctor (button, menu, actions: `QueryMenuActions`, url, overrides:
  `IActiveViewOverrides`, logger). Actions injected at composition root (Dependency Inversion):
  `openOptions` (sends `OPEN_OPTIONS_MESSAGE`), `enableEnhancedView(queryId)` (sends
  `OPEN_BINDING_SETTINGS_MESSAGE`), `disableEnhancedView` (`store.unbind`), `setActiveView(queryId, active)`
  = SESSION-ONLY now (writes the in-memory override + nudges the page controller, NO store write).
  Controller closes menu on navigate & `applyBindings` (stale-close). Menu model: UNBOUND=[Options,
  Enable Enhanced View]; BOUND=[<bound view label> (check if active enhanced), Standard View (check
  if active standard), separator, Options, Disable Enhanced View]. Check mark = `resolveActiveView(
overrides.get(queryId), defaultEnhanced)`. View label via `getViewType(view)?.label ?? raw id`.
- VIEW SWITCH IS EPHEMERAL (session-only) — the fix for "switch is wrongly remembered across browser
  reopen". `QueryBinding` has NO `active` field (REMOVED); nothing per-query is persisted about which
  view shows. Which view a bound query shows on load is driven SOLELY by the global
  `settings.defaultView` ("enhanced"|"original"). The top-bar menu's Standard/Enhanced switch updates
  an IN-MEMORY, device-local override in `src/content/active-view/` (`SessionActiveViewOverrides`
  implements `IActiveViewOverrides { get(queryId):ActiveView|undefined }`; `SessionActiveViewOverrides`
  also has `set(queryId,active)`). Content script is re-injected on every full page load so the Map
  resets → reopening the browser returns every query to the configured default. Constructed ONCE at the
  content composition root (`content/index.ts`) and passed (as read-only `IActiveViewOverrides`) into
  BOTH `QueryPageController` and `QueryBindingController`. Menu action:
  `sessionActiveViews.set(queryId, active)` then `controller.applyActiveViewOverride()` (public method →
  `this.refresh()`) to re-render the page in place; the menu re-reads the override live on next open
  (`BindingMenu` auto-closes on selection).
- `resolveActiveView(override, defaultEnhanced)` = `override ?? (defaultEnhanced ? "enhanced":"standard")`.
  `ActiveView`="enhanced"|"standard" (in-session presentation); `DefaultView`="original"|"enhanced" (the
  synced global setting). `normalizeBindings` DROPS a legacy `active` left by an older build (silently,
  forward/back compatible). `IQueryBindingStore` has NO `setActiveView` anymore (REMOVED from interface +
  `BrowserSyncQueryBindingStore`); it has `unbind(queryId)` (read-modify-write, no-op if absent).
  `QueryPageController.decide()` on a bound query: `resolveActiveView(overrides.get(queryId),
settings.defaultView==="enhanced")`; unbound → not enhanced. `content/index.ts` feeds the binding
  snapshot to BOTH `bindingController.applyBindings` AND `queryPageController.applyBindings`.
- Live-debugging an authed ADO extension: the MCP Playwright browser has NO extension loaded. Launch
  Edge with `--remote-debugging-port=9222 --user-data-dir=<fresh> --load-extension=<ABS path to dist>`
  (relative path is resolved vs Edge CWD, not repo!). If Edge already runs, a plain msedge launch
  joins the existing process and the port never binds — use a distinct user-data-dir. Corp device SSO
  auto-authenticates a fresh Edge profile. Then a zero-dep Node script (global fetch + WebSocket)
  hits `http://127.0.0.1:9222/json/list`, opens the tab's webSocketDebuggerUrl, and drives CDP
  (Runtime.enable/evaluate, Page.captureScreenshot). Retry the initial fetch ~30s for cold start.

## Options page hangs in debug mode (spinner forever, dark bg, no controls, no console error)

- NOT a page-JS bug. `options.html` is static; only sub-resource is a classic body-end
  `options.js` (IIFE, synchronous bootstrap, init voided) — so the `load` event can only hang
  if the resource never fetches/runs, not from any hanging promise.
- Cause: VS Code browser debugger launch configs (`type: msedge`/`chrome` in `.vscode/launch.json`)
  set `waitForDebuggerOnStart` on every new target. The options tab is opened PROGRAMMATICALLY by
  the service worker (`chrome.tabs.create` in `src/background/index.ts`, triggered by the content
  script binding button). js-debug intermittently fails to release that child target, so the tab
  sits paused: throbber spins, Chrome paints only the default dark bg, script never runs, no error.
- Fingerprint match: only in debug mode, refresh re-enters the pause, self-heals after js-debug
  attaches/times out ("goes away after a while"), recurs "every time a thing is added to the store"
  because that flow is what opens the tab via the SW.
- Proof it's the debugger, not code: the identical SW `chrome.tabs.create` flow loads in ~250ms
  when the browser is launched WITHOUT the debugger (verified via Playwright, real unpacked ext).
- Fix/workflow: for manual/visual testing launch the browser WITHOUT js-debug. Added tasks
  "Run: Extension (Edge, no debugger)" / "(Chrome for Testing, no debugger)" that `Start-Process` the
  browser with `--load-extension=dist` + `--remote-debugging-port=9222/9223`.
- CRITICAL race (caused a recurring "Unable to attach to browser"): `Start-Process` returns
  IMMEDIATELY, so a preLaunchTask that only launches the browser lets js-debug fire the attach
  BEFORE Edge/Chrome cold-starts and binds the CDP port (~6s). Browser `attach` configs do NOT
  meaningfully poll, so they fail instantly. FIX: the no-debugger tasks first probe
  `http://127.0.0.1:9222(9223)/json/version` (reuse an already-listening browser, exit 0), else
  `Start-Process` THEN poll the same URL (Invoke-WebRequest, 300ms loop, 30s deadline) and only exit
  once the endpoint answers ("CDP ready on 9222", exit 0; else print an ERROR hint + exit 1). VS
  Code waits for the non-background preLaunchTask to finish, so the port is guaranteed live before
  the attach connects.
- Breakpoints without the pause: the ONLY launch.json configs are now the two `attach` configs
  "Run/Debug Extension (Edge)" (port 9222) / "Run/Debug Extension (Chrome for Testing)" (port 9223),
  each with `preLaunchTask` = the matching "Run: Extension (…, no debugger)" task + `timeout:30000`.
  A single F5/Ctrl-F5 builds, `Start-Process` launches the browser (port bound, no SW pause), then
  attaches. webRoot=dist; esbuild dev builds emit linked source maps so `.ts` breakpoints bind.
- The old `request:launch` configs ("Debug Extension (Edge)"/"(Chrome for Testing)") were DELETED:
  they were FIRST in the list (Ctrl+F5 default when nothing is explicitly selected), and js-debug's
  own browser launch hands off to any existing Edge process -> fails to bind its port -> "Unable to
  launch browser: Unable to attach to browser". They also gated/paused SW-opened tabs. Do NOT
  reintroduce a browser `request:launch` config.
- "Unable to launch browser: Unable to attach to browser" on Ctrl-F5 = either (a, historic) a
  `request:launch` browser config was the selected/default config (now removed), or (b) an `attach`
  config with NOTHING listening on its port (task not run first). Root fix: attach-only configs that
  are self-sufficient via preLaunchTask. If a stale prior Edge still holds port 9222, close it or
  delete `.debug-profiles/edge-nodebug` and retry. Verified: the task's launch+poll binds 9222 from a
  clean state AND reuses it when Edge is already running.

## Single-source-of-truth abstractions (post deep-review refactor)

- `observeSyncKeys` (`src/common/browser/observeSyncKeys.ts`) = THE synced-storage observe race
  protocol (subscribe-before-read, revision-guarded initial read). BOTH `BrowserSyncSettingsStore` and
  `BrowserSyncQueryBindingStore` delegate `observe()` to it. Do NOT reinline the loop in a store.
- `AdoHost` (`src/common/navigation/AdoHost.ts`) = THE ADO host decision: `isSupportedAdoHost`
  (anchored `.visualstudio.com` suffix — rejects fake.visualstudio.com.evil.com; keep anchored),
  `VISUAL_STUDIO_SUFFIX`, `ADO_HOST_MATCH_PATTERNS` (mirrored by manifest
  content_scripts/host_permissions/web_accessible; pinned by `AdoHost.test.ts`), and
  `parseSupportedAdoUrl(raw)` (valid-URL + host guard preamble). `AdoQueryRoute` and `AdoContext` both
  call `parseSupportedAdoUrl` — do NOT re-write `new URL(...)+isSupportedAdoHost` inline.
- `requestFromTab` (`src/common/browser/requestFromTab.ts`) = THE best-effort tab sendMessage
  round-trip used by `ChromeAdoTabReader` (theme). NOTE:
  `ChromeAdoQueryTabsReader`/`IAdoQueryTabsReader` + the `ADO_QUERY_NAME_REQUEST` message plumbing +
  `AdoQueryTab` were REMOVED when the Query Bindings options mode stopped scanning open tabs (see next
  bullet). `detectAdoQueryName` (content probe) survives — it now feeds enableEnhancedView's
  `OPEN_BINDING_SETTINGS_MESSAGE` only.
- `BrowserSyncQueryBindingStore` owns ALL bindings-map read-modify-write (bind/unbind/replaceAll);
  callers forward intent, never RMW the map themselves. (`setActiveView` was REMOVED — view switching
  is now session-only in `content/active-view`, never persisted.) `replaceAll` = wholesale replace
  (`normalizeBindings` first, single set) used by config import — does NOT merge.
- `defaultEnhanced` in `QueryBindingController` derives from `DEFAULT_SETTINGS.defaultView` (not hardcoded).

## options.html `hidden` attribute gotcha

- Toggling `element.hidden` in the options controllers is INERT for any element that also has an
  author `display` rule (e.g. `.field { display: flex }`), because author styles beat the UA
  `[hidden]{display:none}`. Symptom: "Bound query" dropdown (#binding-query-picker-field, class
  `field`) stayed visible even though `QueryBindingsController` set `pickerField.hidden = true`. Same
  latent bug on #binding-query-name-field. This is ALSO why `.tabpanel[hidden]` exists.
- FIX: a global `[hidden] { display: none !important; }` reset near the top of options.html `<style>`
  (after `*{}`). Do NOT rely on plain `element.hidden` for `.field`/flex/grid elements without it.
- jsdom tests don't do layout/cascade, so `.hidden` property tests pass regardless — this bug is
  only visible in a real browser. Verify hide/show behavior in the loaded extension, not just Vitest.

## ADO teams/area-paths came back EMPTY — MV3 content-script CORS (root cause + fix)

- SYMPTOM: options Azure DevOps tab showed org+project (parsed from tab URL, no fetch) but the
  Current team picker + Area paths autocomplete were always empty. Old design proxied the fetch
  through the content script (`ADO_METADATA_REQUEST` round-trip).
- ROOT CAUSE (proven via CDP): in MV3 the content-script isolated world's origin is
  `chrome-extension://<id>`, so its cross-origin fetch to ADO is CORS-blocked -> "Failed to fetch"
  (ADO sends no Access-Control-Allow-Origin for the extension). The content script DID reply, but
  with `{teams:[],areaPaths:[]}`. Extension-PAGE fetch bypasses CORS via host_permissions BUT loses
  ADO's SameSite session cookies -> HTTP 500 "looping logins" (redirected:true). Neither works.
- FIX: fetch in the ADO tab's MAIN (page) world = first-party origin => same-origin AND carries the
  signed-in SameSite session. `ChromeAdoMetadataReader` now calls
  `chrome.scripting.executeScript({ target:{tabId}, world:"MAIN", func: fetchAdoRawInPage, args:[teamsUrl,areaPathsUrl] })`.
  Requires "scripting" in manifest permissions (world:"MAIN" is Chrome 95+, min is 106 so fine).
  Verified live: MAIN-world fetch returns 200 + 100 teams; options picker renders all 100.
- `fetchAdoRawInPage` (`src/common/browser/fetchAdoRawInPage.ts`) is INJECTED via `Function.toString()`,
  so it MUST be self-contained: only its params + page globals (fetch/Promise), NO imports/module
  vars, and use Promise `.then()` (NOT async/await) so no esbuild transpile helper is hoisted out of
  the body. Build target chrome106 keeps it native, but keep `.then()` to be safe. Confirmed the
  bundled dist function is a standalone `function fetchAdoRawInPage(...)` with an inline `get` arrow.
- SPLIT to satisfy jscpd + keep the injected fn pure: `fetchAdoMetadata.ts` is now URL-build + parse
  only (`buildAdoMetadataUrls` -> `{teamsUrl,areaPathsUrl}`|null (null when no project); `parseTeams`;
  `flattenAreaPaths`; `adoCollectionBaseUrl`). Removed
  AdoFetch/AdoFetchResponse/fetchTeams/fetchAreaPaths/resolveAdoMetadata. `AdoMetadata.ts` lost the
  message contract (ADO_METADATA_REQUEST/AdoMetadataRequest/AdoMetadataResponse/isAdoMetadataRequest);
  kept AdoTeam/AdoMetadata/EMPTY_ADO_METADATA. `content/index.ts` metadata handler removed.
  `pickAdoQueryTab` `AdoQueryTabContext` gained `url` (reader needs href to build URLs).
- `requestFromTab` STAYS — still used by `ChromeAdoTabReader` (theme round-trip). Only the metadata
  reader stopped using it.
- COMBOBOX render gotcha when live-verifying: `AutocompleteInput` renders its `<li>` options ONLY on
  focus/input (setOptions alone doesn't render unless the list is already open). To count options via
  CDP you must `input.focus()` first, else `.combobox__list li` is 0 even when teams ARE loaded.

## jscpd gotcha

- `.jscpd` threshold is 0 and IGNORES `**/*.test.ts`, so PROD dedup is strict. A shared ~12-line
  "new URL(raw)+host-guard+split path" preamble across two files trips it — extract a helper
  (that's why `parseSupportedAdoUrl` exists). Test-file fakes may duplicate freely.
- Two IDENTICAL interface bodies (get/set/subscribe, ~52 tokens) ALSO trip it (minTokens 50).
  `IBrowserSyncStorage` + `IBrowserLocalStorage` now BOTH alias a shared base
  `IBrowserKeyValueStorage.ts` (`export type IBrowserSyncStorage = IBrowserKeyValueStorage`), so the
  body exists once. A class can still `implements` a type-alias-of-interface. Do NOT re-inline the
  method signatures into either alias.
- TWO MAIN-world injected fetchers CANNOT share a helper (each is serialized standalone via
  `Function.toString` → no imports/module-scope). `fetchAdoTreeInPage`'s paged `.value`-accumulate
  block tripped jscpd against `fetchAdoRawInPage`'s readPage. FIX = restructure one copy so tokens
  differ (if/for + renamed vars instead of ternary+`value`), NOT extract a shared function. But the
  pure URL-build boilerplate (parseAdoContext+new URL+adoCollectionBaseUrl+encode project) IS a normal
  module → extract it: `resolveAdoProjectContext(href)`→`{base,project}`|null in `fetchAdoMetadata.ts`,
  reused by `buildAdoMetadataUrls` AND `fetchAdoTree.buildAdoTreeUrls`.

## Project Tracking LIVE tree fetch (ADR-033) — content→background→MAIN-world bridge

- `loadTree` is NO LONGER a placeholder. Chain: `ProjectTrackingView` → `services.loadTree` →
  `MessagingWorkItemTreeLoader` (common/browser, browser-agnostic, injected SendTreeRequest) → sends
  `LOAD_QUERY_TREE_MESSAGE` {queryId, fields} (`AdoTreeRequest.ts` contract) → background onMessage
  handler builds URLs from `sender.tab.url` (TRUSTED, never content-supplied — closed op, not a
  fetch-any-URL proxy) via `buildAdoTreeUrls` → `chrome.scripting.executeScript` world:"MAIN"
  func:`fetchAdoTreeInPage` → returns raw {wiql,items} → loader `parseTrackedTree(raw, etaFieldByType)`.
- `fetchAdoTreeInPage` (common/browser): WIQL by id (`_apis/wit/wiql/{id}`) → collect ids from
  workItemRelations (target.id + non-null source.id) or flat workItems → page `_apis/wit/workitemsbatch`
  POST {ids,fields} 200/page (cap 10000 ids, 100 pages). Self-contained, `.then()` chaining, type-only
  `AdoRawTree` import (erased). Same rules as `fetchAdoRawInPage`.
- background onMessage for the tree msg MUST be a SEPARATE addListener returning `true` (async
  sendResponse); the existing open-options/binding listener returns undefined. `sender.tab?.id/url`
  undefined → sendResponse {raw:null}.
- `content/index.ts`: `sendTreeRequest` uses generic
  `chrome.runtime.sendMessage<LoadQueryTreeMessage, LoadQueryTreeResponse|undefined>(m)` to avoid
  no-unsafe-return; `etaFieldByType()` rebuilt per load from `latestSettings.workItemTypes`
  (name→etaField). empty userDirectory is still a follow-up.

## Project Tracking LIVE sprint window (team iterations) — same content→background→MAIN bridge

- `EnhancedViewServices.getSprints` (returned SprintRef[]) was REPLACED by
  `loadSprintWindow(): Promise<SprintWindow>`. SprintRef (common/ado/TrackedWorkItem) DELETED.
- Chain mirrors the tree loader: `ProjectTrackingView` → `services.loadSprintWindow` →
  `MessagingTeamIterationsLoader` (common/browser, injected send) → `LOAD_TEAM_ITERATIONS_MESSAGE`
  {team} (`AdoIterationsRequest.ts`) → SEPARATE background onMessage addListener →
  `buildAdoIterationsUrl` (common/ado/TeamIteration, from TRUSTED sender.tab.url + team) →
  executeScript world:MAIN `fetchAdoIterationsInPage` (single credentialed GET, unpaged — the endpoint
  returns the full bounded list; self-contained `.then()`) → `parseTeamIterations` → `buildSprintWindow`.
- `buildSprintWindow(iterations, {pastCount,futureCount})` (common/ado/sprintWindow, PURE/DOM-free,
  REUSABLE by any sprint-filtering view): anchors on `timeFrame==="current"` (else first "future", else
  last), slices [anchor-pastCount .. anchor+futureCount], labels by offset (0 Current, 1 Next sprint,
  -1 Previous, >1 "{n} sprints ahead", <-1 "{n} sprints ago"). Returns
  {entries:SprintWindowEntry[] {path,name,label}, currentName}.
- `SprintPicker` keeps option.value=name (raw) and callbacks return raw name — only added optional
  `SprintOption.label` for DISPLAY text, so filtering by sprintName still works.
- `content/index.ts` `loadSprintWindow` reads `latestSettings.currentTeam` (a TeamRef {id,name}, NOT a
  string) → uses `team.id` (GUID-safe) for the URL; blank/no team → {entries:[],currentName:null}.
  bounds from past/futureSprintsCount ?? DEFAULT_SETTINGS.
- `ProjectTrackingView.render` now `Promise.all([loadTree, loadSprintWindow])` — existing 2-await test
  flush pattern still works. `collectSprintsFromTree` REMOVED.
- SPRINT PILL (per-row, shown when filter OFF) = LEAF sprints ONLY. An item on the iteration ROOT
  (single top-level node, e.g. just the project/team name — iterationPath has NO backslash) is NOT a
  real sprint, so it shows NO pill. `isLeafSprint(item)` = `sprintName!=null && iterationPath!=null &&
iterationPath.includes("\\")`. sprintName = leaf of iterationPath (`sprintLeaf` in fetchAdoTree.ts).
  NOTE for tests: the epic ROOT is rendered in the HEADER, not as a row — rows are its DESCENDANTS —
  so to test root-iteration pill suppression, park a CHILD (e.g. `epic.children[1]`) on "Project", not
  the epic. Filtering (matchesSprintFilter) still uses raw sprintName; only the badge got the leaf gate.
- Two latent bugs in the pre-existing `fetchAdoTree.ts` (its own tests caught them): (1)
  `parseTrackedTree` checked queryType!=="tree" BEFORE the null check, so wiql:null returned
  error:null — must null-check FIRST (null/non-object → load error) then queryType (flat → error:null).
  (2) `htmlToText` stripped tags THEN decoded, so entity-encoded markup (&lt;p&gt;) survived — must
  DECODE entities first, THEN strip.
- `expect.arrayContaining(TRACKING_FIELDS)` fails TS (readonly[] not assignable) → spread
  `[...TRACKING_FIELDS]`.

## Options Work item types table — UI refinements (AutocompleteInput + WorkItemTypesController)

- `AutocompleteInput.enableFloating()`: switches the suggestion list to position:fixed computed from
  `input.getBoundingClientRect()` so it ESCAPES the `.wit-table-wrap` overflow clip (overflow-x:auto
  computes overflow-y to auto → clipped otherwise). Flips ABOVE the input when
  spaceBelow<listHeight && top>spaceBelow. Tracks input via capturing document 'scroll' (non-bubbling,
  capture catches descendant scroll boxes) + window 'resize'; listeners attach in openList()/detach in
  close()+dispose(). Fixed escapes overflow only because no ancestor has transform/filter/will-change
  (verify before reusing). WIT type + state comboboxes call enableFloating(); area-path/team ones stay
  absolute.
- `AutocompleteInput.reopen()`: re-opens the list for the current value ONLY if input is still the
  activeElement. `commitState()` calls it after placing a chip because a pick keeps focus, so no fresh
  'focus' event fires to reveal the remaining pool ("dropdown doesn't reappear after adding a state").
- Type picker = new-row only: `applyType()` shows a read-only colored `.wit-type__label` and hides
  `combobox.root` (`typeComboboxRoot(row)`); `clearRowType()` reverses it. The type `<input>` STAYS in
  the DOM (hidden), so `typeInput()`/`setAvailableTypes()`/`commitType()` still work by querySelector.
  A chosen type is not re-editable — remove the row to change it.
- Row delete is now the compact "×" (`.wit-row__delete` restyled like `.wit-col__delete`), not a big
  "Remove" danger button.
- `.app` is fluid now: `padding: 24px 5vw 40px` (no max-width) so side margins scale with window width.
- WIT ROW ORDER IS MEANINGFUL = parent→child, top-most parent first (Epic→Feature→Story→Task).
  `workItemTypes` ARRAY ORDER is the hierarchy; `normalizeWorkItemTypes`/`collect()`/`render()` all
  preserve it, so save+export+import keep order (arrays iterate in order). Each type row has a grip drag
  handle (data-role="type-drag", span.wit-row__drag, draggable=true, first child of
  .wit-row__type-inner). `handleDragStart` branches: `closest(ROW_DRAG_SELECTOR)`→startRowDrag (tracks
  this.draggingRow, sets setDragImage(row)); else chip drag (this.draggingChip).
  `handleDragOver`/`Drop` check draggingRow FIRST (dropRow: before/after target by index, then
  renderEtaSection()+persistTypes()), else chip logic. `endDrag` clears BOTH. `dropRow` MUST call
  `renderEtaSection()` so the read-only ETA list re-renders in the new table order (ETA list mirrors
  committedRows() = DOM order). Tests dispatch plain Event (no dataTransfer) so the
  transfer/setDragImage branch is skipped — guard setDragImage with typeof check.
- DROP INDICATOR: `handleDragOver` (row branch) calls `showDropIndicator(target)` which adds
  wit-row--drop-before (dragging up) or wit-row--drop-after (dragging down) to the hovered row, tracked
  in this.dropIndicatorRow; `clearDropIndicator()` removes both classes; `endDrag()` clears it too. Same
  before/after index logic as dropRow so preview matches landing. CSS draws the line on `> td`
  (box-shadow inset ±2px var(--accent)) — a border on `<tr>` is unreliable. Hovering the dragged row
  itself shows no line.

## Memory bank / changelog state (deep-review)

- Memory bank was FLATTENED (no wave/history narrative) — treat current state as the repo baseline.
  `decisions.md` ADR-017..020 cover observeSyncKeys, AdoHost single-source, store-owns-RMW, and the
  host-wide-injection+route-gated performance posture. `systemPatterns.md` references ADR-020.
  ADR-021..023 now cover source-aware logging, decisions-log-their-signals, and the Diagnostics
  source filter + View Log deep link. ADR-025 records the component→source rename + dropdown filter.
- ChangeLog: shipped work consolidated under `## 0.1` (unpublished); `## Next Version` accumulates
  the current unreleased bullets.

## Environment quirk — spurious terminal exit code (DO NOT chase it)

- `pnpm`/`cmd` invocations in this developer's PowerShell print a spurious "The system cannot find the
  path specified." line and the run tool reports a trailing "Command exited with code 1" EVEN WHEN the
  command fully succeeded. Root cause is a cmd AutoRun pointing at a missing path (fires for every
  cmd/.CMD shim like `pnpm.cmd`); it does NOT reflect the tool's real result. This is a machine-local
  quirk, recorded here so agents on this developer's machines don't waste time chasing it.
- JUDGE SUCCESS BY THE STAGE OUTPUT, not the trailing exit code. `pnpm verify` chains stages with
  `&&` (format:check → lint → typecheck → duplication → test:scripts → test:coverage →
  validate:workflows), so if the LAST stage printed "validate-workflows: all workflow checks passed"
  then every prior stage passed. Do not re-run verify to hunt a phantom failure.
- Invoke as `pnpm.cmd` (bare `pnpm` may fail to resolve in that shell). lint has pre-existing WARNINGS
  (complexity/max-lines-per-function on big test describe arrows + scripts) — 0 errors = pass; do
  NOT "fix" those warnings.

## Source-aware logging (src/common/logging)

- `LogEntry.source` is an OPTIONAL `string` = the emitting CLASS NAME by convention (free-form, NOT a
  closed union). `formatLogEntry` emits `[ISO] LEVEL [source] message` (source omitted when absent).
  `normalizeLogEntry` reads the LEGACY `component` key into `source` (`pickSource` helper) so
  pre-rename buffered entries keep their origin after upgrade.
- NO LogComponent union anymore (`LogComponent.ts` DELETED). `ILoggerFactory.forSource(source: string)`
  → Logger that stamps source on each entry and prefixes console.error `AwesomeADO [source]:`.
  Composition roots build via `createLoggerFactory()` / `createLogging()` (createLogging also returns
  logStore for the options Diagnostics view) and pass a class-name LITERAL per collaborator (never
  `this.constructor.name` — minification-safe). Source names decided: background/content/options for
  wiring contexts; QueryPageController, QueryBindingController, BrowserSyncSettingsStore,
  BrowserSyncQueryBindingStore, StatusReporter for classes. LoggerFactory is NOT a composition root →
  needs coverage.
- Shared stores take logger as an OPTIONAL ctor arg (absent = no-op, no behavior change):
  BrowserSyncSettingsStore, BrowserSyncQueryBindingStore. They log SAVES BY NAME ONLY, never values
  (keeps org/team identity out of an exportable log).
- Decision sites log only on a FLIP (dedup by remembering last conclusion) with signals + reason:
  QueryPageController (enhance vs leave-on-ADO, reason=not-a-query-route|ado-not-configured|
  query-not-bound|bound-view-active|bound-standard-active), QueryBindingController (config
  completeness, button/menu show/hide/open).
- Diagnostics source filter = a SEARCHABLE MULTI-SELECT DROPDOWN (`src/options/MultiSelectFilter.ts`, a
  GENERIC options-page widget with no logging knowledge — reusable). Hidden until ≥1 source exists.
  `DiagnosticsController` derives distinct source keys DYNAMICALLY from entries (unlabeled →
  `(unlabeled)`), feeds them to `sourceFilter.setItems` (rebuilds list only when the set changes),
  tracks hidden sources in a Set keyed by source (survives re-render), AND-combines with errors-only.
  Dropdown: type-to-filter search + Select all/Clear all; closes on outside pointerdown or Escape;
  `dispose()` removes listeners. Row source cell uses `.log-row__source`.
- "View Log" menu footer (separator + item) appended to EVERY BindingMenu variant → sends
  {type:OPEN_OPTIONS_MESSAGE, section:"diagnostics"}. `optionsPath(section)` appends
  `?section=diagnostics`; options/index reads `readOptionsSectionFromSearch` → `tabs.activate(
sectionTabId(section))`. Section contract is a typed OptionsSection (isOptionsSection) in
  `BindingRequest.ts` shared by sender + reader.

## Views architecture (src/content/views + src/common/view-common) + enhanced surface

- LAYOUT (moved from src/common/views, ADR-027): concrete views live under `src/content/views/<view>/`
  (they ARE content — they replace the ADO page). PURE CONTRACTS live in `src/common/view-common/`.
  One folder per view holds BOTH halves (config + renderer) together for readability.
- CONTRACTS in `src/common/view-common/` (Dependency Inversion, NOT a §6 break):
  - `ViewType.ts` = config contract (ViewType/ViewTypeProperty/ViewTypeOption/ViewTypePropertyKind +
    viewTypePropertyKind() + resolveViewTypePropertyValue()).
  - `EnhancedView.ts` = renderer contract { id, render(context) }; EnhancedViewContext = { doc,
    queryId, properties }. Renderer returns a FRESH element each call (caller owns lifecycle).
- CONCRETE views in `src/content/views/`:
  - `viewCatalog.ts` (VIEW_TYPES=[sprintViewType, projectTrackingViewType] + getViewType(id)) = the
    CONFIG catalog. `enhancedViewRegistry.ts` (ENHANCED_VIEWS + getEnhancedView(id)) = the RENDERER
    registry. Each view folder `<view>/` has `<view>ViewType.ts` (config) + `<view>View.ts` (renderer).
    Current views: sprint, project-tracking. Keep VIEW_TYPES and ENHANCED_VIEWS in the SAME order.
- THE §6 EXCEPTION (scoped, lint-enforced): options builds the binding form from view CONFIG, so
  `src/options/query-bindings/QueryBindingsController.ts` imports VIEW_TYPES from
  `content/views/viewCatalog`. This is the ONLY allowed options→content import. Enforced by
  `import-x/no-restricted-paths` in eslint.config.js: zone target ./src/options, from ./src/content,
  except ["./views/viewCatalog.ts"]. Recorded as ADR-027.
- GUARDRAIL (why the exception is safe): a `<view>ViewType.ts` must NEVER import its `<view>View.ts`, so
  viewCatalog pulls ZERO renderer DOM into the options bundle (tree-shaking keeps options clean).
  The renderer (enhancedViewRegistry + *View.ts) is imported ONLY by content.
- Shared per-view building blocks live in `src/content/views/shared` (renderViewScaffold = placeholder
  title+message shell, self-contained inline styles, textContent so XSS-safe). Future cross-view
  components (context menu, sprint selector, queued writes back to ADO) go here too.
- FULL-WINDOW COVERAGE is solved ONCE in `EnhancedViewSurface` (NOT per view): the host div is a FIXED
  overlay (position:fixed;top/left/right/bottom:0;z-index:2147483646;overflow:auto;background:
  var(--background-color,#fff)) kept ALIGNED to ADO's own content region so the breadcrumb bar AND the
  left navigation rail both stay visible. top/left are re-synced LIVE from
  `[role=main].getBoundingClientRect()` (syncOverlayToContent, change-detected via
  overlayTop/overlayLeft so it only writes on a real move). The left rail is COLLAPSIBLE so its width
  changes at runtime — the overlay MUST follow it (that was the bug: measure-once left the widened rail
  peeking under the view). Hide rule is visibility:hidden (NOT display:none) so [role=main] keeps its
  box and stays measurable. Live tracking = ResizeObserver on [role=main] (guarded: typeof
  ResizeObserver!=="undefined" — jsdom lacks it) set up in trackContentRegion (re-observes only when
  ADO swaps the main instance); the keep-alive MutationObserver ALSO calls trackContentRegion each
  mutation (drives the sync in jsdom + catches moves w/o size change). Fallback top/left 0 (full
  window) until measurable; reset on restore(). Shared ViewScaffold root uses
  min-height:100%+box-sizing:border-box so placeholder text centers in the WHOLE window (was 60vh,
  which under-filled). Do NOT re-solve page coverage inside individual views — the overlay gives every
  view the full window below the bar.
- `PageBlanker` was REPLACED by `src/content/query-page/EnhancedViewSurface` (PageBlanker.ts +
  .test.ts DELETED). `apply(request|null)`: request={viewId,queryId,properties}; resolves via
  `getEnhancedView`; null OR unknown viewId → restore ADO; else mount hidden [role=main] + fixed host
  overlay (id awesomeado-enhanced-view) + render the view. Skips re-render on unchanged signature
  (viewId\0queryId\0JSON.stringify(props)). MutationObserver keep-alive re-attaches if ADO drops the
  host (mirrors BindingButton.keepPlaced). `QueryPageController` now takes EnhancedViewSurface (not
  PageBlanker), decide() returns {request,reason}; flip-dedup logs enhanced:<viewId> vs left-on-ado.
- GOTCHA (log-count tests): on a query route the FIRST refresh after settings arrive ALWAYS logs a
  conclusion (enhanced or left-on-ado). If a test applies settings before bindings it logs
  left-on-ado FIRST then enhanced:<view> = 2 calls. Order applyBindings BEFORE applySettings so the
  first refresh concludes enhanced:<view> directly (1 call).
- Adding a view: folder + `<view>ViewType.ts` + `<view>View.ts` (renderViewScaffold hello-world) + one
  line in viewCatalog.ts + one in enhancedViewRegistry.ts + README. Documented in the
  add-enhanced-view skill (`.agents/skills/add-enhanced-view/SKILL.md`, listed in AGENTS.md §13).

## Settings import/export (AwesomeADO.config)

- `src/common/settings-transfer/AwesomeAdoConfig.ts` (PURE, no DOM/chrome): `exportConfig(settings,
bindings)`→indented JSON {awesomeAdoConfigVersion,settings,enhancedQueries}; `importConfig(text)`→
  {settings,enhancedQueries} (JSON.parse then require a marker: numeric awesomeAdoConfigVersion OR
  a settings/enhancedQueries key, else throw — stops an unrelated JSON from wiping config to
  defaults; then normalizeSettings/normalizeBindings). CONFIG_FILE_NAME="AwesomeADO.config".
- `src/options/settings-transfer/SettingsTransferController`: Export/Import buttons + hidden file
  input + status line on the APPEARANCE tab (options.html card after Default view). Reads BOTH
  settingsStore + bindingStore; import writes settings via store.write(full) + bindings via
  bindingStore.replaceAll (wholesale). Download/read use AMBIENT browser APIs (Blob/URL/anchor,
  file.text()) inline like DiagnosticsController — NOT injected; test via mocking URL.createObjectURL
  - spyOn(HTMLAnchorElement.prototype,'click') + a real File. Only chrome.* is injected (via stores).
    Wired in options/index.ts (composition root). Reviewer expectation: ambient DOM/URL/Blob inside a
    controller is fine; only chrome.* must be injected.

## Options tab REUSE + in-place section reveal (View Log always lands on Diagnostics)

- PROBLEM: chrome.tabs.create NEVER dedupes, so Options-then-View-Log stacked duplicate options
  tabs, and a duplicate could open on the default Appearance tab — making "View Log shows
  Diagnostics" unreliable when options was already open. (The URL deep-link itself was proven
  correct end-to-end via CDP; the failure mode is the SECOND tab, not the wiring.)
- FIX (background/index.ts, composition root, excluded from coverage): track the last options tab id
  in an in-memory `lastOpenedOptionsTabId`. reuseOrOpenOptionsTab: if set, focusExistingOptionsTab
  (chrome.tabs.update{active:true} + chrome.windows.update{focused:true}) and, when a section is
  requested, chrome.tabs.sendMessage(tabId, {type:REVEAL_OPTIONS_SECTION_MESSAGE, section}); on any
  throw (tab closed) clear the id and fall back to chrome.tabs.create (store tab.id).
- options/index.ts registers chrome.runtime.onMessage → isRevealOptionsSectionMessage →
  tabs.activate(sectionTabId(section)) so the OPEN tab switches section IN PLACE (no reload, keeps
  in-progress edits). Load-time (?section=) and live-reveal BOTH resolve the tab element id through
  ONE shared sectionTabId(section) map in BindingRequest.ts (SECTION_TAB_IDS) — keep them in sync.
- NO "tabs" permission needed: we track the id in memory rather than chrome.tabs.query({url}).
  chrome.tabs.get/update/create + chrome.windows.update work without "tabs". The id is forgotten on
  SW recycle (harmless: one-time fallback to a fresh tab). Contract added to BindingRequest.ts:
  REVEAL_OPTIONS_SECTION_MESSAGE, RevealOptionsSectionMessage, isRevealOptionsSectionMessage,
  sectionTabId — covered by BindingRequest.test.ts.
- VERIFIED live (CDP probe5): send OPEN_OPTIONS (no section) → 1 options tab (Appearance); then send
  OPEN_OPTIONS section=diagnostics → STILL 1 tab (reused, url unchanged options.html) now on
  aria-selected tab-diagnostics. No duplicate.
- If the USER still sees View Log on Appearance after a build: they are running a STALE unpacked
  extension — reload it in edge://extensions / chrome://extensions after `pnpm build`.
- SAME reuse-tab gap existed for "Enable Enhanced View" (OPEN_BINDING_SETTINGS_MESSAGE): reusing the
  open options tab only focused it (URL unchanged, no re-read) so the bind form never populated. FIX
  mirrors the section-reveal: BindingRequest.ts adds REVEAL_BINDING_SETTINGS_MESSAGE {queryId,
  queryName?} + isRevealBindingSettingsMessage (shares hasBindingQueryFields with the open guard to
  dodge jscpd). background/index.ts now passes a RevealMessage (RevealOptionsSectionMessage |
  RevealBindingSettingsMessage) to focusExistingOptionsTab and sends it on reuse; the section reveal
  object MUST be typed `const reveal: RevealMessage | undefined` or its `type` widens to string (TS2345).
  options/index.ts registers a listener (inside the binding block, where `tabs` + `bindings` are in
  scope) → tabs.activate("tab-bindings") + bindings.revealFixedQuery(queryId, queryName ?? null).
  QueryBindingsController.revealFixedQuery re-reads the store (picks up a binding added since load)
  then re-runs initFixedQuery. Test tip: seed a post-load binding via store.read.mockResolvedValueOnce
  (NOT store.bind(...) directly — vi.fn ReturnType isn't callable under TS, TS2348).

## Feature Crew reconciles MUST be serialized (lost-update / reverted-tag bug)

- SYMPTOM: adding a new assignee tag on the Project Tracking board set the pill for ~1s then reverted,
  and the tag was not persisted anywhere (no error logged).
- ROOT CAUSE: `createFeatureCrewSync.reconcile` (content/views/project-tracking/ProjectTrackingView.ts)
  was fire-and-forget. Every reconcile is a READ-MODIFY-WRITE against the ONE shared Feature Crew work
  item (`background/index.ts reconcileFeatureCrew` → MAIN-world find + apply). The load-time `seed()`
  reconcile and a `setTag()` reconcile ran CONCURRENTLY. The seed reconcile (which knows nothing about
  the just-picked tag) resolves last, so its `onReconciled(members-without-tag)` → `applyCrewMembers`
  → `applyFeatureCrewTags` repaints the pill tag-less (the "revert"). On a first-ever load the two
  concurrent creates also clobber each other so the tag lands nowhere. The tree renders "??" pills
  SYNCHRONOUSLY before the seed resolves, so the user can retag inside the race window.
- FIX: chain every reconcile onto a single `reconcileChain: Promise<void>` in `createFeatureCrewSync`
  so they run strictly one-at-a-time (snapshot `assignees` at execution time; swallow errors to keep
  the chain alive — the writer logs its own failures). seed then always completes (creating the item)
  before setTag reads it, so the tag write is last and is never lost/reverted. General rule: any
  read-modify-write against a shared ADO item from the view MUST be serialized, never fired in parallel.
- TEST TIMING: serialization adds ONE microtask hop before `services.featureCrew.reconcile` is called,
  so tests that assert reconcile-request counts right after `render()` must drain with
  `await new Promise((r) => setTimeout(r, 0))` (full macrotask flush), NOT one or two
  `await Promise.resolve()`. The regression test drives a DEFERRED fake reconcile (pending[] of
  settle() closures that apply the request like the real background) and asserts the setTag reconcile
  does NOT fire until the seed is settled.
