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

This layer also owns small utilities shared by the higher layers: `observeStorageKeys`, the
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

### `observeStorageKeys(storage, keys, project, listener)` — `observeStorageKeys.ts`

The shared way to watch one or more synced keys and receive a complete, normalized snapshot: once
after the initial read, and again on every later change. It subscribes before reading so no change
is missed, and a change that lands during the initial read wins (the read never clobbers a fresher
live value). `project` maps the accumulated key→value record into the snapshot type and must be
pure.

```typescript
const { ready, unsubscribe } = observeStorageKeys(
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

### `fetchAdoRawInPage(teamsUrl, areaPathsUrl, workItemTypesUrl, fieldsUrl)` — `fetchAdoRawInPage.ts`

The self-contained function `ChromeAdoMetadataReader` injects into the ADO tab's MAIN world. It runs
in the page's first-party origin, so its `fetch` is same-origin and sends the user's session cookies.
It is serialized with `Function.prototype.toString`, so it must reference only its parameters and
page globals — never an import or module-scoped value. It returns the raw
`{ teams, areaTree, workItemTypes, fields }` JSON (each `null` on failure) for the reader to parse
with `parseTeams` / `flattenAreaPaths` / `parseWorkItemTypes` (the `fields` body resolves which of a
type's fields are date-typed via `parseDateFieldReferenceNames`).

## Loading a query's work-item tree

The Project Tracking enhanced view needs the live work-item tree behind a query, but it runs in a
content script whose isolated-world origin cannot reach the credentialed ADO REST API. These three
pieces bridge that gap: the content side asks the background worker (via a typed message) to run a
MAIN-world fetch and hand back the raw bodies, which the content side then parses.

### `AdoTreeRequest.ts` — the content→background message contract

- `LOAD_QUERY_TREE_MESSAGE` / `LoadQueryTreeMessage` (`{ type, queryId, fields }`) — the request the
  content side sends to the worker.
- `LoadQueryTreeResponse` (`{ raw: AdoRawTree | null }`) — the worker's reply; `raw` is `null` when
  the tree could not be loaded.
- `isLoadQueryTreeMessage(value)` — the guard the worker uses to accept only well-formed requests.

Both ends import this one contract so the message shape cannot drift.

### `MessagingWorkItemTreeLoader` (class) — the content-side loader

The `IWorkItemTreeLoader` implementation the enhanced view depends on. It is browser-agnostic: the
`chrome.runtime.sendMessage` binding is injected as a `SendTreeRequest`, so this class never touches
`chrome` itself.

```typescript
const loader = new MessagingWorkItemTreeLoader(
  (message) => chrome.runtime.sendMessage(message),
  () => etaFieldByType, // ReadonlyMap<typeName, etaFieldReferenceName>
  logger,
);
const result = await loader.loadTree(queryId); // WorkItemTreeResult
```

`loadTree` requests `TRACKING_FIELDS` plus each type's configured ETA field, sends the message, and
parses the reply with `parseTrackedTree`. A missing/`null` reply (or a thrown send) is logged and
returned as an error result — it never throws. Construct it only in the content composition root
(`src/content/index.ts`); feature code depends on `IWorkItemTreeLoader`.

### `fetchAdoTreeInPage(wiqlUrl, batchUrl, fields)` — `fetchAdoTreeInPage.ts`

The self-contained function the **background worker** injects into the ADO tab's MAIN world (via
`chrome.scripting.executeScript`) to serve a `LoadQueryTreeMessage`. Like `fetchAdoRawInPage`, it is
serialized with `Function.prototype.toString`, so it references only its parameters and page globals.
It runs the WIQL query (`_apis/wit/wiql/{id}`), collects the work-item ids from the result, pages the
`_apis/wit/workitemsbatch` endpoint (200 ids per page) to hydrate the requested `fields`, and returns
the raw `{ wiql, items }` (`AdoRawTree`) for `parseTrackedTree` to normalize. The URLs are built by
`buildAdoTreeUrls` (in `common/ado/fetchAdoTree`) from the sender's own trusted tab URL, keeping the
worker a closed "load this query's tree" operation rather than a fetch-any-URL proxy.

## Loading a team's iterations (sprints)

A sprint-filtering view (e.g. Project Tracking) needs the current team's iterations to build its
sprint picker. The team-iterations REST call is credentialed and team-scoped, so it mirrors the tree
read: the content script messages the background worker, which runs the fetch in the ADO tab's MAIN
world and hands back the raw body for parsing.

### `AdoIterationsRequest.ts` — the content→background message contract

- `LOAD_TEAM_ITERATIONS_MESSAGE` / `LoadTeamIterationsMessage` (`{ type, team }`) — the request the
  content view sends to load a team's iterations.
- `LoadTeamIterationsResponse` (`{ raw }`) — the raw `teamsettings/iterations` body, or `null` on
  failure.
- `isLoadTeamIterationsMessage(value)` — the type guard the worker uses before serving the request.

### `MessagingTeamIterationsLoader` (class) — the content-side loader

The `ITeamIterationsLoader` implementation the sprint picker depends on. It messages the worker with
the team name, parses the returned body with `parseTeamIterations`, and degrades to an empty list
(logged) on any failure. The `send` function is injected so the class never touches `chrome.runtime`
itself; the composition root supplies the real binding.

### `fetchAdoIterationsInPage(iterationsUrl)` — `fetchAdoIterationsInPage.ts`

The self-contained function the background worker injects into the ADO tab's MAIN world to serve a
`LoadTeamIterationsMessage`. It performs one credentialed GET of the team-iterations endpoint (the
list is small and unpaged) and returns the raw body, or `null` on any non-ok/thrown response. The URL
is built by `buildAdoIterationsUrl` (in `common/ado/TeamIteration`) from the sender's own trusted tab
URL, keeping the worker a closed "read this team's iterations" operation.

## Searching Azure DevOps for people

An assignee picker resolves names against ADO's own identity directory. That read is credentialed
too, so it follows the same bridge as the tree and iterations reads.

### `AdoIdentityRequest.ts` — the content→background message contract

- `SEARCH_ADO_IDENTITIES_MESSAGE` / `SearchAdoIdentitiesMessage` (`{ type, query }`) — the request a
  people picker sends with the text the user typed.
- `SearchAdoIdentitiesResponse` (`{ raw }`) — the raw Identity Picker body, or `null` on failure.
- `isSearchAdoIdentitiesMessage(value)` — the type guard the worker uses before serving the request.

### `MessagingUserDirectory` (class) — the content-side directory

The `IUserDirectory` implementation the assignee pickers depend on. It messages the worker with the
typed query, parses the returned body with `parseAdoIdentities`, and degrades to an empty list
(logged) on any failure. Queries shorter than the search minimum are answered without a round-trip,
and each answered query is remembered for the directory's lifetime so backspacing over a name does
not re-ask ADO. `resolve` returns an identity only on an exact display-name or unique-name match, so
it never guesses a person from a partial one.

### `fetchAdoIdentitiesInPage(url, body)` — `fetchAdoIdentitiesInPage.ts`

The self-contained function the background worker injects into the ADO tab's MAIN world to serve a
`SearchAdoIdentitiesMessage`. It performs one credentialed POST of the caller-built search and
returns an `AdoIdentitySearchOutcome` (`{ status, body, failure }`) rather than a bare body, so the
worker can log **why** a search came back empty:

- `failure: "none"` — `body` holds the parsed response.
- `failure: "http"` — ADO rejected the request; `status` says how.
- `failure: "sign-in"` — a 200 that was not JSON, i.e. ADO's HTML sign-in page (expired session).
- `failure: "network"` — the request never completed (`status` is `0`).

Only the status and the classification are reported: ADO's error text quotes the query, which is a
person's name, and the diagnostics log is exported into bug reports. The URL and body come from
`buildAdoIdentitySearchRequest` (in `common/ado/fetchAdoIdentities`), built from the sender's own
trusted tab URL, keeping the worker a closed "search this organization's people" operation.

## Reconciling the Feature Crew roster

The Project Tracking view keeps a project's **Feature Crew** roster — the list of everyone assigned
to the project's work — in a dedicated, permanently-`Removed` work item (see
`common/ado/FeatureCrew`). Writing it needs the credentialed ADO REST API, which the isolated content
world cannot reach, so the write mirrors the tree read: the content script messages the background
worker, which runs the reads/writes in the ADO tab's MAIN world.

### `FeatureCrewRequest.ts` — the content→background message contract

- `RECONCILE_FEATURE_CREW_MESSAGE` / `ReconcileFeatureCrewMessage`
  (`{ type, rootId, typeName, assignees }`) — the request the content view sends to reconcile the
  roster against the people currently assigned.
- `ReconcileFeatureCrewResponse` (`{ ok, changed, id?, error?, members? }`) — the worker's reply;
  `ok` is false with an `error` string when the reconcile could not complete, and `members` (on
  success) is the reconciled roster with each person's hand-set tag so the view can paint tags.
- `isReconcileFeatureCrewMessage(value)` — the guard the worker uses to accept only well-formed
  requests.

### `MessagingFeatureCrewWriter` (class) — the content-side writer

The `IFeatureCrewWriter` implementation the enhanced view depends on. Browser-agnostic: the
`chrome.runtime.sendMessage` binding is injected as a `SendReconcileRequest`, so this class never
touches `chrome` directly.

```typescript
const writer = new MessagingFeatureCrewWriter(sendReconcileRequest, logger);
const result = await writer.reconcile({ rootId, typeName, assignees }); // FeatureCrewReconcileResult
```

`reconcile` builds the message, sends it, and maps the reply to a `FeatureCrewReconcileResult`. A
thrown send, a missing/`undefined` reply, or an `ok: false` response is logged and reported as
`{ ok: false, changed: false }` — the write is best-effort and never throws, so a roster failure can
never block the board. Constructed only in the composition root (`src/content/index.ts`); feature
code depends on `IFeatureCrewWriter`.

### `findFeatureCrewInPage(...)` — `findFeatureCrewInPage.ts`

The self-contained function the **background worker** injects into the ADO tab's MAIN world to locate
an existing Feature Crew item without creating a duplicate. It POSTs a WIQL query for items matching
the fixed title, the (last-configured) type, and the `Removed` state, then reads each candidate's
relations and returns the first whose `Affects-Reverse` link points at the project root id — telling
a real Feature Crew item apart from an unrelated same-titled one in another project. Returns
`{ id, rev, description }` or `null` when none matches. Serialized with `Function.prototype.toString`,
so it references only its parameters and page globals.

### `applyFeatureCrewInPage(config)` — `applyFeatureCrewInPage.ts`

The self-contained function the **background worker** injects into the ADO tab's MAIN world to write
the roster. In `create` mode it POSTs a JSON-Patch that sets the title, description, and the
`Affects-Reverse` relation to the root — creating the item in its default new state — then PATCHes it
to the `Removed` state, because ADO rejects creating an item directly in a closed state; in `update`
mode it PATCHes only the description of an existing item. Both paths also set
`System.Description` to **Markdown** (`/multilineFieldsFormat/System.Description`) so the one-per-line
roster renders beneath the heading instead of collapsing onto one line as HTML would. Uses the
`application/json-patch+json` content type and returns a `FeatureCrewApplyResult` (`{ id }` on
success, or `{ id: null, error }` on failure — the `error` carries the HTTP status plus ADO's error
message, or the thrown value — so the caller logs the specific reason). Serialized with
`Function.prototype.toString`.

## Writing a work item field back to ADO

An enhanced view can persist a single work item field change (moving it between board columns via
`System.State`, editing a type's ETA date field, etc.) back to Azure DevOps. The write needs the
credentialed ADO REST API, which the isolated content world cannot reach, so the pattern mirrors the
tree read and Feature Crew reconcile: the content script messages the background worker, which runs
the PATCH in the ADO tab's MAIN world.

### `WorkItemFieldRequest.ts` — the content→background message contract

- `UPDATE_WORK_ITEM_FIELD_MESSAGE` / `UpdateWorkItemFieldMessage` (`{ type, id, rev, field, value }`)
  — the request the content view sends to update a single work item field. `field` is the ADO field
  reference name and `value` is the new value (or `null` to clear the field). Includes `rev` as an
  optimistic-concurrency guard; the PATCH fails when the item was edited concurrently (its rev
  advanced).
- `UpdateWorkItemFieldResponse` (`{ ok, rev?, error? }`) — the worker's reply; `ok` is false with an
  `error` string when the update could not complete, and `rev` is the item's new System.Rev on
  success.
- `isUpdateWorkItemFieldMessage(value)` — the guard the worker uses to accept only well-formed
  requests.

### `MessagingWorkItemFieldWriter` (class) — the content-side writer

The `IWorkItemFieldWriter` implementation the enhanced view depends on. Browser-agnostic: the
`chrome.runtime.sendMessage` binding is injected as a `SendUpdateFieldRequest`, so this class never
touches `chrome` directly.

```typescript
const writer = new MessagingWorkItemFieldWriter(sendUpdateFieldRequest, logger);
const result = await writer.writeField({ id, rev, field, value }); // WorkItemFieldWriteResult
```

`writeField` builds the message, sends it, and maps the reply to a `WorkItemFieldWriteResult`. A
thrown send, a missing/`undefined` reply, or an `ok: false` response is logged and reported as
`{ ok: false }` — the write never throws, so a failure can be handled gracefully by the view.
Constructed only in the composition root (`src/content/index.ts`); feature code depends on
`IWorkItemFieldWriter`.

### `updateWorkItemFieldInPage(updateUrl, id, rev, field, value)` — `updateWorkItemFieldInPage.ts`

The self-contained function the **background worker** injects into the ADO tab's MAIN world to PATCH
a single work item field. Uses JSON Patch (`application/json-patch+json`) with a test-and-set: the
rev is tested first (`{ op: "test", path: "/rev", value: rev }`), then the field is written — a set
value adds it (`{ op: "add", path: "/fields/<field>", value }`) and a `null` value clears it
(`{ op: "remove", path: "/fields/<field>" }`). Returns `{ ok: true, rev }` on success (extracting the
new rev from the response body), or `{ ok: false, error }` on failure. The URL is built by
`buildWorkItemUpdateUrl` (in `common/ado/fetchAdoTree`) from the sender's own trusted tab URL.
Serialized with `Function.prototype.toString`, so it references only its parameters and page globals.
