# src/common/browser

This folder contains the browser storage abstraction layer for the AwesomeADO extension.

## Purpose

`ChromeSyncStorage` is the **only** place in the codebase that touches `chrome.storage.sync`,
`ChromeLocalStorage` is the **only** place that touches `chrome.storage.local`, and the
chrome.tabs/chrome.scripting readers (`ChromeAdoTabReader`, `ChromeAdoMetadataReader`, and their
shared `pickAdoQueryTab` helper) are the only places that touch `chrome.tabs`/`chrome.scripting`.
Isolating the browser APIs here
means all other code (settings, content, options) can be unit-tested with injected fakes and remains
browser-agnostic.

This layer also owns small utilities shared by the higher layers: `observeSyncKeys`, the
race-safe protocol both stores use to observe synced storage; `onStorageAreaChange`, the single
change-event filter both storage adapters reuse; and `requestFromTab`, the best-effort round-trip
`ChromeAdoTabReader` uses to ask a tab's content script a question.

## Public API

### `IBrowserSyncStorage` (interface)

A minimal, promise-based key/value store abstraction. It is a named alias of the shared
`IBrowserKeyValueStorage` contract (defined in `IBrowserKeyValueStorage.ts`), so the synced and
device-local areas share one shape declared in a single place:

```typescript
interface IBrowserKeyValueStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  subscribe(key: string, listener: (value: unknown) => void): () => void;
}
```

- `get(key)` — resolves with the stored value or `undefined` if absent.
- `set(key, value)` — persists the value under `key`.
- `subscribe(key, listener)` — calls `listener` with `newValue` on any change to `key` in
  `chrome.storage.sync`. Returns an unsubscribe function; call it to stop listening.

### `ChromeSyncStorage` (class)

The production implementation backed by `chrome.storage.sync`.

```typescript
import { ChromeSyncStorage } from "./ChromeSyncStorage";

const storage = new ChromeSyncStorage();
const value = await storage.get("my-key");
await storage.set("my-key", 42);
const unsubscribe = storage.subscribe("my-key", (newValue) => {
  console.warn("key changed to", newValue);
});
// later:
unsubscribe();
```

## Usage guidance

- Do **not** import `ChromeSyncStorage` in feature classes. Features depend on `IBrowserSyncStorage`
  (injected). `ChromeSyncStorage` is constructed only in the composition root
  (`src/common/settings/createSettingsStore.ts`).
- For tests, implement `IBrowserSyncStorage` with an in-memory fake (see
  `BrowserSyncSettingsStore.test.ts`).

## Device-local storage

### `IBrowserLocalStorage` (interface)

The same shape as `IBrowserSyncStorage` — both are named aliases of the shared
`IBrowserKeyValueStorage` contract — but a **separate** name (Interface Segregation) so consumers
state which area they need. Backed by `chrome.storage.local`, whose data stays on the device and is
never synced across the user's browsers.

```typescript
type IBrowserLocalStorage = IBrowserKeyValueStorage;
```

### `ChromeLocalStorage` (class)

The production implementation backed by `chrome.storage.local`. Used only by the diagnostics log
(see `src/common/logging`) so recorded lines never leave the device.

```typescript
import { ChromeLocalStorage } from "./ChromeLocalStorage";

const storage = new ChromeLocalStorage();
await storage.set("diagnostics.log", []);
```

Construct `ChromeLocalStorage` only in a composition root (`src/common/logging/createLogger.ts`).
Feature code depends on `IBrowserLocalStorage`.

### `onStorageAreaChange(area, key, listener)` — `onStorageAreaChange.ts`

The shared change-event filter. `chrome.storage.onChanged` fires for every key in every area, so
both `ChromeSyncStorage.subscribe` and `ChromeLocalStorage.subscribe` delegate here to forward only
the `newValue` of one key within one area. Returns an unsubscribe function.

```typescript
const unsubscribe = onStorageAreaChange("local", "diagnostics.log", (value) => {
  console.warn("log changed", value);
});
unsubscribe();
```

## Observing synced keys

### `observeSyncKeys(storage, keys, project, listener)` — `observeSyncKeys.ts`

The shared way to watch one or more synced keys and receive a complete, normalized snapshot: once
after the initial read, and again on every later change. It subscribes before reading so no change
is missed, and a change that lands during the initial read wins (the read never clobbers a fresher
live value). `project` maps the accumulated key→value record into the snapshot type and must be
pure.

```typescript
const { ready, unsubscribe } = observeSyncKeys(
  storage,
  ["settings.theme", "settings.defaultView"],
  (raw) =>
    normalizeSettings({ theme: raw["settings.theme"], defaultView: raw["settings.defaultView"] }),
  (settings) => console.warn("changed:", settings),
);
await ready; // resolves after the initial snapshot; rejects if the initial read fails
unsubscribe();
```

`StorageObservation` (`{ ready, unsubscribe }`) is the returned handle, and is the shape
`ISettingsStore.observe` and `IQueryBindingStore.observe` resolve to. Both stores delegate to this
helper so the race-sensitive protocol lives in exactly one place.

## Messaging ADO tabs

### `requestFromTab(tabId, message, interpret, fallback)` — `requestFromTab.ts`

Sends one message to a tab's already-injected content script and interprets the reply, returning
`fallback` when the tab has no receiver (`chrome.tabs.sendMessage` rejects). `ChromeAdoTabReader`
uses it so the "no receiver → nothing to report" contract is defined once.

```typescript
const theme = await requestFromTab<AdoThemeResponse, AdoTheme | null>(
  tabId,
  { type: ADO_THEME_REQUEST },
  (response) => (response?.theme === "light" || response?.theme === "dark" ? response.theme : null),
  null,
);
```

## Reading the active ADO tab

### `IAdoTabReader` (interface)

Lets the options page learn which Azure DevOps organization/project the user is on, and which
theme that tab is rendering, without touching `chrome.tabs` directly:

```typescript
interface IAdoTabReader {
  read(): Promise<AdoTabContext | null>;
}
```

`read()` resolves with the active ADO Query tab's `{ organization, project, theme }`
(`AdoTabContext`, defined in `../navigation/AdoContext`), or `null` when no such tab is open.

### `ChromeAdoTabReader` (class)

The production implementation. It queries the active tab via `chrome.tabs.query`, keeps only ADO
Query URLs, parses the organization/project with `parseAdoContext`, and asks the tab's content
script which theme it is rendering (`ADO_THEME_REQUEST`) via `chrome.tabs.sendMessage`. Theme
detection is best-effort: any messaging failure resolves the `theme` field to `null`.

```typescript
import { ChromeAdoTabReader } from "./ChromeAdoTabReader";

const reader = new ChromeAdoTabReader();
const context = await reader.read(); // { organization, project, theme } | null
```

Construct `ChromeAdoTabReader` only in the composition root (`src/options/index.ts`). Feature code
depends on `IAdoTabReader`. Reading tab URLs and messaging ADO tabs requires the
`host_permissions` declared in `manifest.json`.

## Which origins the reader scans

`ChromeAdoTabReader` passes `ADO_HOST_MATCH_PATTERNS` (from `../navigation/AdoHost`) to
`chrome.tabs.query`, so it scans exactly the origins the content script is injected on. That
constant is the single source of truth for the ADO match globs and is kept in sync with the manifest
by a test in `AdoHost.test.ts`.

### `pickCurrentAdoQueryTab()` — `pickAdoQueryTab.ts`

The shared way to locate the ADO Query tab the user came from. It queries
`ADO_HOST_MATCH_PATTERNS`, keeps only Query URLs, and prefers the active tab, then the most recently
accessed one (opening the options page makes options the active tab, so the ADO tab is no longer
active). Both `ChromeAdoTabReader` and `ChromeAdoMetadataReader` reuse it so the selection rule lives
in one place.

## Reading ADO project metadata

### `IAdoMetadataReader` (interface)

Lets the options page list the detected organization/project along with its teams and area paths,
without touching `chrome.tabs` directly:

```typescript
interface IAdoMetadataReader {
  read(): Promise<AdoMetadataContext | null>;
}
```

`read()` resolves with `{ organization, project, teams, areaPaths }` (`AdoMetadataContext`, defined
in `./IAdoMetadataReader`), or `null` when no ADO Query tab is open.

### `ChromeAdoMetadataReader` (class)

The production implementation. It picks the current ADO Query tab with `pickCurrentAdoQueryTab`,
parses the organization/project with `parseAdoContext`, then injects `fetchAdoRawInPage` into that
tab's **page (MAIN) world** via `chrome.scripting.executeScript` to fetch the teams and area tree.
The options page runs on the `chrome-extension://` origin, whose cross-origin fetch is CORS-blocked
and whose same-origin fetch loses ADO's SameSite session cookies; the MAIN-world fetch is the only
context that is both same-origin with the APIs and carries the signed-in session. Metadata is
best-effort: a non-project tab or any injection failure resolves the team/area lists to empty.

```typescript
import { ChromeAdoMetadataReader } from "./ChromeAdoMetadataReader";

const reader = new ChromeAdoMetadataReader();
const metadata = await reader.read(); // { organization, project, teams, areaPaths } | null
```

Construct `ChromeAdoMetadataReader` only in the composition root (`src/options/index.ts`). Feature
code depends on `IAdoMetadataReader`. Injecting into the ADO tab requires the `scripting` permission
and the `host_permissions` declared in `manifest.json`.

### `fetchAdoRawInPage(teamsUrl, areaPathsUrl, workItemTypesUrl)` — `fetchAdoRawInPage.ts`

The self-contained function `ChromeAdoMetadataReader` injects into the ADO tab's MAIN world. It runs
in the page's first-party origin, so its `fetch` is same-origin and sends the user's session cookies.
It is serialized with `Function.prototype.toString`, so it must reference only its parameters and
page globals — never an import or module-scoped value. It returns the raw
`{ teams, areaTree, workItemTypes }` JSON (each `null` on failure) for the reader to parse with
`parseTeams` / `flattenAreaPaths` / `parseWorkItemTypes`.
