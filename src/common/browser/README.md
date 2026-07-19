# src/common/browser

This folder contains the browser storage abstraction layer for the AwesomeADO extension.

## Purpose

`ChromeSyncStorage` is the **only** place in the codebase that touches `chrome.storage.sync`, and
`ChromeAdoTabReader` and `ChromeAdoQueryTabsReader` are the only places that touch `chrome.tabs`.
Isolating the browser APIs here means all other code (settings, content, options) can be
unit-tested with injected fakes and remains browser-agnostic.

This layer also owns two small utilities shared by the higher layers: `observeSyncKeys`, the
race-safe protocol both stores use to observe synced storage, and `requestFromTab`, the best-effort
round-trip both tab readers use to ask a tab's content script a question.

## Public API

### `IBrowserSyncStorage` (interface)

A minimal, promise-based key/value store abstraction:

```typescript
interface IBrowserSyncStorage {
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
`fallback` when the tab has no receiver (`chrome.tabs.sendMessage` rejects). Both tab readers use it
so the "no receiver → nothing to report" contract is defined once.

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

## Enumerating all open ADO query tabs

### `IAdoQueryTabsReader` (interface)

Lets the options binding form discover every Azure DevOps query the user currently has open, so it
can offer them for binding without touching `chrome.tabs` directly:

```typescript
interface IAdoQueryTabsReader {
  readQueryTabs(): Promise<AdoQueryTab[]>;
}
```

`readQueryTabs()` resolves with one `AdoQueryTab` (`{ queryId, queryName }`, defined in
`../navigation/AdoContext`) per distinct saved query open in a tab; `queryName` is `null` when it
could not be read from the page.

### `ChromeAdoQueryTabsReader` (class)

The production implementation. It queries all ADO tabs via `chrome.tabs.query`, parses each tab
URL's query id with `parseAdoQueryId`, de-duplicates queries open in several tabs (keeping the
first), and asks each tab's content script for the query's display name (`ADO_QUERY_NAME_REQUEST`)
via `chrome.tabs.sendMessage`. Name detection is best-effort: any messaging failure yields a `null`
name.

```typescript
import { ChromeAdoQueryTabsReader } from "./ChromeAdoQueryTabsReader";

const reader = new ChromeAdoQueryTabsReader();
const tabs = await reader.readQueryTabs(); // [{ queryId, queryName }, ...]
```

Construct `ChromeAdoQueryTabsReader` only in the composition root (`src/options/index.ts`). Feature
code depends on `IAdoQueryTabsReader`. Reading tab URLs and messaging ADO tabs requires the
`host_permissions` declared in `manifest.json`.

## Which origins the readers scan

Both readers pass `ADO_HOST_MATCH_PATTERNS` (from `../navigation/AdoHost`) to `chrome.tabs.query`,
so they scan exactly the origins the content script is injected on. That constant is the single
source of truth for the ADO match globs and is kept in sync with the manifest by a test in
`AdoHost.test.ts`.
