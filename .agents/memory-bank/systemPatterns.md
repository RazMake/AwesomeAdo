# System Patterns

## Layer Map

Runtime code lives under `src/`, split so that all browser APIs are isolated and every feature
depends on abstractions.

```
src/common/browser/    chrome API isolation + shared browser-layer helpers
src/common/settings/   the theme / default-view settings model + synced store
src/common/bindings/   the per-query binding model, view catalog, synced store, open-page contract
src/common/navigation/ ADO host/route/identity parsing + navigation and probe message contracts
src/content/           the content script: blanking policy, top-bar button/menu, on-demand probes
src/options/           the options page controllers
src/background/        the service worker (SPA navigation forwarding + opening extension pages)
scripts/               build + release automation (never bundled into the extension)
```

### `src/common/browser`

The **only** place allowed to touch `chrome.*`:

- `ChromeSyncStorage` — the only user of `chrome.storage.sync` (`IBrowserSyncStorage`).
- `ChromeAdoTabReader` / `ChromeAdoQueryTabsReader` — the only users of `chrome.tabs`
  (`IAdoTabReader` / `IAdoQueryTabsReader`), used by the options page to read the active ADO tab's
  org/project/theme and to enumerate open query tabs.
- `observeSyncKeys` — the shared, race-safe "subscribe before reading, revision-guard the initial
  read" protocol both stores use to observe synced storage. Returns `StorageObservation`.
- `requestFromTab` — the shared best-effort tab round-trip (missing receiver → a fallback value)
  both tab readers use.

### `src/common/settings`

`ExtensionSettings` (`theme`, `defaultView`) + `normalizeSettings`; `ISettingsStore` implemented by
`BrowserSyncSettingsStore` (one synced key per setting); `createSettingsStore()` composition
factory.

### `src/common/bindings`

`QueryBinding`/`QueryBindings` + `resolveActiveView` + `normalizeBindings`; the `ViewType` catalog
(`VIEW_TYPES`); `IQueryBindingStore` implemented by `BrowserSyncQueryBindingStore` (the whole map
under one synced key); `createQueryBindingStore()` factory; `BindingRequest` (the typed messages and
extension-relative URLs for opening the options page for one query).

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

- `QueryPageController` + `PageBlanker` — decide whether the current route should be enhanced and
  reversibly blank the page when it should.
- `QueryBindingController` + `BindingButton` + `BindingMenu` — own the top-bar button's visibility
  policy and the menu it opens.
- `AdoThemeProbe` / `AdoQueryNameProbe` — read the rendered theme / query name from the DOM, only
  when the options page asks for them.

### `src/options`

`OptionsController` (with the nested `SettingBinding` optimistic-persist helper), `QueryBindingsController`,
`TabsController`, `StatusReporter`, and the `theme` resolver.

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

- **Synced-storage observation** lives once in `observeSyncKeys`. Both stores delegate to it, so the
  subtle revision-guard race logic cannot drift between them.
- **"Which URLs are ADO"** lives once in `AdoHost` (predicate + match patterns). The route parser,
  the identity parser, and both tab readers all derive from it; the manifest globs are pinned to it
  by `AdoHost.test.ts`.
- **The bindings-map read-modify-write** lives only in `BrowserSyncQueryBindingStore`
  (`bind`/`unbind`/`setActiveView`); the content script forwards intent instead of re-deriving it.
- **The effective per-query view** is resolved only by `resolveActiveView`, shared by the content
  blanker and the top-bar menu so they always agree.
- **The default view** is read from `DEFAULT_SETTINGS`, never re-hardcoded.

## SOLID Mapping

- **S** — Each class has one reason to change (e.g. `ChromeSyncStorage` only talks to storage;
  `PageBlanker` only mutates the DOM; `QueryBindingController` only owns button/menu policy).
- **O** — Consumers depend on interfaces (`ISettingsStore`, `IQueryBindingStore`,
  `IBrowserSyncStorage`, `IAdoTabReader`, `IAdoQueryTabsReader`); new backends or views are added
  without editing consumers (a new view is one `VIEW_TYPES` entry).
- **L** — Any interface implementation (real chrome-backed or a test fake) is interchangeable.
- **I** — Interfaces stay small and focused; storage, settings, bindings, and tab-reading contracts
  are separate.
- **D** — Feature code depends only on abstractions; concretes are injected only at the composition
  roots above.

## Performance Posture

- Host-wide injection on `dev.azure.com`/`*.visualstudio.com` is required to catch ADO's SPA
  navigation into and out of Query routes within one tab.
- To stay light on non-query pages, all heavy work is gated behind a parsed query id: `PageBlanker`
  paints only when `QueryPageController.shouldEnhance()` is true, and `BindingButton`'s
  `MutationObserver` is created only when `QueryBindingController` sees a query id. The probes run
  only on request from the options page.
- The only always-on cost on any ADO page is the two synced-storage observers and the one runtime
  message listener the content script wires. See ADR-020.
