# System Patterns

## Layer Map

Runtime code lives under `src/`, split so that all browser APIs are isolated and every feature
depends on abstractions.

```
src/common/browser/    chrome API isolation + shared browser-layer helpers
src/common/settings/   the theme / default-view settings model + synced store
src/common/bindings/   the per-query binding model, view catalog, synced store, open-page contract
src/common/navigation/ ADO host/route/identity parsing + navigation and probe message contracts
src/content/           the content script, split into feature subfolders (query-page, query-binding, ado-probe)
src/options/           the options page, split into feature subfolders (appearance, ado-config, query-bindings, diagnostics, alerts, shell)
src/background/        the service worker (SPA navigation forwarding + opening extension pages)
scripts/               build + release automation (never bundled into the extension)
```

### `src/common/browser`

The **only** place allowed to touch `chrome.*`:

- `ChromeSyncStorage` — the only user of `chrome.storage.sync` (`IBrowserSyncStorage`).
- `ChromeAdoTabReader` — the only user of `chrome.tabs` (`IAdoTabReader`), used by the options page
  to read the active ADO tab's org/project/theme.
- `observeSyncKeys` — the shared, race-safe "subscribe before reading, revision-guard the initial
  read" protocol both stores use to observe synced storage. Returns `StorageObservation`.
- `requestFromTab` — the shared best-effort tab round-trip (missing receiver → a fallback value)
  both tab readers use.

### `src/common/settings`

`ExtensionSettings` (`theme`, `defaultView`) + `normalizeSettings`; `ISettingsStore` implemented by
`BrowserSyncSettingsStore` (one synced key per setting); `createSettingsStore()` composition
factory.

### `src/common/bindings`

`QueryBinding`/`QueryBindings` + `resolveActiveView` + `normalizeBindings`; `IQueryBindingStore`
implemented by `BrowserSyncQueryBindingStore` (the whole map under one synced key, with
`bind`/`unbind`/`setActiveView`/`replaceAll`); `createQueryBindingStore()` factory; `BindingRequest`
(the typed messages and extension-relative URLs for opening the options page for one query).

### `src/common/view-common`

The pure view **contracts** both bundles depend on (Dependency Inversion, no DOM/chrome): `ViewType`
(shape + value helpers) and `EnhancedView`/`EnhancedViewContext`. The concrete views (catalog,
registry, renderers) live under `src/content/views` — see the `src/content` section. Keeping only the
abstractions here is ordinary DIP, not a §6 exception.

### `src/common/settings-transfer`

`AwesomeAdoConfig` — `exportConfig`/`importConfig` (+ `CONFIG_FILE_NAME`) serialize the whole
configuration (all settings + every binding) to/from an `AwesomeADO.config` file, normalizing on the
way in and out. Pure data plumbing; the options-side wiring lives in `src/options/settings-transfer`.

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
- `ado-config/` — `AzureDevOpsController` + `WorkItemTypesController` + the reusable `AutocompleteInput`.
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

- **Synced-storage observation** lives once in `observeSyncKeys`. Both stores delegate to it, so the
  subtle revision-guard race logic cannot drift between them.
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
