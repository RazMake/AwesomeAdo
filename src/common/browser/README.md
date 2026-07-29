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

## Naming the people behind `@`-mentions

A work item's description and its discussion store an `@`-mention as a bare identity GUID, so a view
that renders them has to ask who those people are. That read is credentialed like the others, and
follows the same bridge — but it is asked in **bulk**: every mention on the board at once, rather
than one lookup per mentioned person per item.

### `AdoIdentityNamesRequest.ts` — the content→background message contract

- `RESOLVE_ADO_IDENTITY_NAMES_MESSAGE` / `ResolveAdoIdentityNamesMessage` (`{ type, ids }`) — the
  request a view sends with the identity GUIDs it collected.
- `ResolveAdoIdentityNamesResponse` (`{ raw, complete }`) — one raw `_apis/identities` body per batch
  that was read, or `null` when nothing could be read. A **partial** list is deliberate: names that
  did resolve are still worth rendering. `complete` says whether every requested id was actually put
  to ADO and answered for — the endpoint simply OMITS an id it cannot resolve, so without it a short
  answer is indistinguishable from a failed batch.
- `isResolveAdoIdentityNamesMessage(value)` — the type guard the worker uses before serving it.

### `MessagingMentionDirectory` (class) — the content-side directory

The `IMentionDirectory` implementation views depend on. It messages the worker with the ids, parses
the returned bodies with `parseAdoIdentityNames`, and degrades to "no names resolved" (logged) on any
failure.

Two rules make it correct under the overlap that actually happens in a board:

- **In-flight reads are shared, not skipped.** A caller that wants an id another caller is already
  asking about **awaits that read**. Returning early on "already asked" is what left a mention
  anonymous purely because a different panel had asked about the same person a moment earlier.
- **Only a settled answer is remembered.** An id is never re-asked once it has a name, or once a
  `complete` read said ADO does not recognize it (retrying cannot change that, and a board repaints
  often enough to turn it into a request loop). Anything else — a failed batch, a truncated id list,
  a rejected round-trip, a reply no listener claimed — stays open for the next render.

The log names the unresolved **ids** (capped, never the names that resolved) and says whether they
will be retried, so "why is that one mention anonymous?" is answerable from Diagnostics alone.

`resolveMentionsIn(directory, sources)` is the collect-then-resolve pair the callers use (the board
before it repaints its descriptions, a notes panel after it fetches and after it writes); it asks
nothing when the content mentions nobody.

### `fetchAdoIdentityNamesInPage(urls)` — `fetchAdoIdentityNamesInPage.ts`

The self-contained function the background worker injects into the ADO tab's MAIN world to serve a
`ResolveAdoIdentityNamesMessage`. It performs one credentialed GET per caller-built batch URL and
returns an `AdoIdentityNamesOutcome` (`{ status, bodies, failure }`) using the same failure
classification as the identity search above — except that `bodies` keeps every batch that **did**
succeed, because the batching is only a URL-length concern and one bad batch must not discard the
rest.

> **Note:** this is the one ADO read here that is genuinely **cross-origin**. Bulk identity reads are
> served from the `vssps` service host, not the collection base (see `resolveAdoIdentityServiceBase`).
> ADO's own web application makes the same hop from the same page, so the session rides along on
> `credentials: "include"`; a tenant that refused it would arrive as a `network` failure and every
> mention would simply keep its placeholder.

The URLs come from `buildAdoIdentityNamesUrls` (in `common/ado/mentionIdentities`), built from the
sender's own trusted tab URL with each id re-validated as a GUID, keeping the worker a closed
"who are these people in this organization?" operation.

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

### `updateWorkItemFieldInPage(config)` — `updateWorkItemFieldInPage.ts`

The self-contained function the **background worker** injects into the ADO tab's MAIN world to PATCH
a single work item field. Takes ONE `UpdateWorkItemFieldConfig`
(`{ updateUrl, rev, field, value, multilineFormat?, comment?, baseValue? }`) rather than an argument
each, because `executeScript` requires every entry of `args` to be JSON-serializable and `undefined`
is not — an omitted optional argument is an unserializable hole in that array and Chrome rejects the
whole injection before it runs (see the note under **Injecting into the page world** below).

Uses JSON Patch (`application/json-patch+json`) with a test-and-set: the
rev is tested first (`{ op: "test", path: "/rev", value: rev }`), then the field is written. A `null`
value clears it (`{ op: "remove", path: "/fields/<field>" }`); any other value sets it, using
`replace` when `baseValue` names a non-empty current value and `add` otherwise. The op is not
cosmetic: Azure DevOps treats `add` on `System.Tags` as **append**, so a shortened tag list comes
back `HTTP 200` with every tag still on the item — a removal that silently never happened. `replace`
sets a field that already holds a value; a field with nothing to replace still takes `add`.
Returns `{ ok: true, rev }` on success (extracting the
new rev from the response body), or `{ ok: false, error }` on failure. The URL is built by
`buildWorkItemUpdateUrl` (in `common/ado/fetchAdoTree`) from the sender's own trusted tab URL.
Serialized with `Function.prototype.toString`, so it references only its parameters and page globals.

Two more operations can ride along in the **same** patch, and both must:

- `multilineFormat` → `{ op: "add", path: "/multilineFieldsFormat/<field>", value }`. A multiline
  field left on ADO's default (`Html`) stores Markdown source verbatim, so setting the format in a
  later request would leave one revision of literal asterisks behind.
- `comment` → `{ op: "add", path: "/fields/System.History", value }`, the discussion comment saying
  why the change was made. **Never post it through the comments API instead**: that creates its own
  revision, so the field patch is then rejected by its own rev test with `HTTP 412`. One patch means
  one revision — the change and its reason land together or neither does. It rides with
  `/multilineFieldsFormat/System.History` = `Markdown`, which is what makes an `@`-mention in it
  reach the person: left on that field's default HTML, Azure DevOps HTML-ENCODES the value (quotes
  and all) and the reader sees markup where a name belongs. As Markdown it takes the same `@<guid>`
  token a discussion note does, and needs no escaping. See the `batch-work-item-writes` skill.

`baseValue` — the value the caller believes the field currently holds — authorizes **one**
rebase-and-retry when the rev test is refused (`HTTP 412`/`409`). The item is re-read and the same
patch is re-sent against the server's current rev **only** while the field still holds `baseValue`;
otherwise the conflict is reported as `HTTP 412 — the field changed since it was read`. Supply it
whenever the new value is derived from the old one (adding a tag to the tags already there), because
a drag-reorder, the rank fallback, a note posted through the comments API and any edit made in ADO's
own tab all advance `System.Rev` **without reporting the new one** — so a cached rev goes stale by
itself and every later write is refused until the board is reloaded. Omit it to keep the strict
"one attempt, no rebase" behaviour.

## Moving a work item (drag-to-reorder)

Dragging a row to a new position in an enhanced view changes two things in Azure DevOps: the item's
manual backlog rank and, when it lands under a different parent, its hierarchy link. Both need the
credentialed REST API, so the pattern is the same as every other write here — the content script
messages the background worker, which runs the calls in the ADO tab's MAIN world.

### `WorkItemReorderRequest.ts` — the content→background message contract

- `REORDER_WORK_ITEM_MESSAGE` / `ReorderWorkItemMessage`
  (`{ type, id, rev, parentId, currentParentId, previousId, nextId, team }`) — the move. Position is
  named as the two siblings the item lands **between** (`0` means start of the list / end of the list
  / no parent) rather than as a rank, because ADO owns the rank arithmetic. `team` is required
  because backlog order is per-team in ADO.
- `ReorderWorkItemResponse` (`{ ok, order?, rev?, error?, detail? }`) — the worker's reply; `order` is
  the rank ADO assigned and `rev` the item's new System.Rev when the re-parent patch ran. `detail`
  carries the raw body ADO returned with a rejected request (truncated), kept separate from `error`
  so the page world can stay minimal — it reports what the server said, and module code turns that
  into a sentence.
- `isReorderWorkItemMessage(value)` / `reorderMessageProblem(value)` — the guard the worker uses, and
  the same check phrased as a **reason**. The worker validates with the latter and replies with the
  offending field rather than ignoring a malformed message: an ignored message reaches the content
  side as the uninformative "no response from background", which looks identical to a worker that has
  no handler at all. Every id must be a positive integer, except the parent/neighbour references
  which may also be `0` (ADO's own sentinel); `rev` must be a non-negative integer and `team`
  non-blank.
- `describeReorderFailure(response)` — folds a rejected response into one readable sentence,
  preferring the JSON body's `message` ("TF401232: work item 123 does not exist") over the raw body
  and over the bare status. This is what turns "order HTTP 400" into something actionable in the log.

### `MessagingWorkItemReorderWriter` (class) — the content-side writer

The `IWorkItemReorderWriter` implementation the enhanced view depends on. Browser-agnostic: the
`chrome.runtime.sendMessage` binding is injected as a `SendReorderRequest`, so this class never
touches `chrome` directly.

```typescript
const writer = new MessagingWorkItemReorderWriter(sendReorderRequest, logger);
const result = await writer.reorder({
  id,
  rev,
  parentId,
  currentParentId,
  previousId,
  nextId,
  siblingIds,
  team,
});
```

A thrown send, a missing reply, or an `ok: false` response is logged and reported as `{ ok: false }`,
so a move never throws. A successful move logs the ids it moved between — never a title, since the
diagnostics log is exported into bug reports. Constructed only in the composition root
(`src/content/index.ts`); feature code depends on `IWorkItemReorderWriter`.

### `reorderWorkItemInPage(config)` — `reorderWorkItemInPage.ts`

The self-contained function the **background worker** injects into the ADO tab's MAIN world to move
an item. It runs up to two calls, in this order:

1. **Re-parent** (skipped when `config.reparent` is false): GET the item with `$expand=relations` to
   find the index of its `System.LinkTypes.Hierarchy-Reverse` link — JSON Patch can only remove a link
   by index — then PATCH `test /rev` + `remove` the old link + `add` the new one. A `null`
   `parentLinkUrl` removes the parent without adding one.
2. **Re-rank**: PATCH the team-scoped `_apis/work/workitemsorder` endpoint with
   `{ ids, parentId, previousId, nextId }` and read the assigned `order` back.

Doing the link first means a rejected re-parent leaves **both** the tree and the rank untouched. The
re-rank carries no rev because backlog order is team state, not a field on the item, so a rev test
there would reject harmlessly concurrent moves of unrelated items. Every URL in `config` is built by
the worker from the sender's own trusted tab URL (see `common/ado/reorderWorkItems`). Serialized with
`Function.prototype.toString`, so it references only its parameter and page globals.

### `readWorkItemRanksInPage(config)` / `writeWorkItemRanksInPage(config)`

The pair the worker injects when ADO **refuses** to rank an item (`TF400486`) and the rank has to be
written directly instead — see `common/ado/rankFallback` for when and why.

- `readWorkItemRanksInPage({ batchUrl, ids, field })` POSTs `_apis/wit/workitemsbatch` for one page of
  ids and hands the body back **unparsed**; reading ranks out of it is module code that can be tested.
  The caller pages the ids (the endpoint caps a request at 200).
- `writeWorkItemRanksInPage({ field, writes })` PATCHes `{ id, url, rank }` one item after another and
  reports which ids landed. It sends **no `test /rev`** guard, unlike every other patch here: a rank
  is a position the operation just computed rather than a value a person authored, and guarding it
  would leave a renumbered level half-written whenever anyone had touched an unrelated field.

Both are serialized with `Function.prototype.toString` and reference only their parameter and page
globals. Every URL is built by the worker from the sender's own trusted tab URL.

## Reading and writing a work item's notes (its Discussion)

The Project Tracking board shows each item's ADO Discussion as its **notes**, and lets the reader add
one or correct their own. Both halves follow the pattern above: the content script messages the
background worker, which runs the credentialed calls in the ADO tab's MAIN world and builds every URL
from the **sender's own trusted tab URL**.

### `WorkItemNoteRequest.ts` — the content→background message contract

- `LOAD_WORK_ITEM_NOTES_MESSAGE` / `LoadWorkItemNotesMessage` (`{ type, workItemId, sinceIso }`) —
  read one item's discussion, no further back than the view's Updates window.
- `RawWorkItemNotes` (`{ pages, connection, status, failure, connectionStatus, connectionFailure }`)
  — the raw bodies the read produced: each comments page, the org's `ConnectionData` (for the
  signed-in identity), and a **classified** outcome for each of the two reads. `failure` is
  `none` / `http` / `sign-in` / `network`, because an expired session and an item with no notes would
  otherwise both arrive as an empty list and be equally silent in the log. The identity read is
  classified **separately** because the two fail independently and mean different things: failed
  notes are an empty panel, a failed identity is a full panel in which nothing is editable.
- `LoadWorkItemNotesResponse` (`{ raw, error? }`).
- `WRITE_WORK_ITEM_NOTE_MESSAGE` / `WriteWorkItemNoteMessage`
  (`{ type, workItemId, noteId, text }`) — post a note (`noteId: null`) or rewrite one.
- `WriteWorkItemNoteResponse` (`{ ok, raw?, error? }`) — the saved comment body on success.
- `isLoadWorkItemNotesMessage(value)` / `isWriteWorkItemNoteMessage(value)` — the guards: a positive
  integer work item id, a parseable `sinceIso`, a non-blank `text` no longer than `MAX_NOTE_LENGTH`,
  and a `noteId` that is either `null` or a real id.
- `loadNotesMessageProblem(value)` / `writeNoteMessageProblem(value)` — the same checks phrased as a
  **reason**. The worker validates with these and replies with the offending field rather than
  ignoring a malformed message: an ignored message reaches the content side as the uninformative
  "no response from background", which looks identical to a worker that has no handler at all. The
  over-long-note reason reports the note's LENGTH, never its text — these reasons are logged.
- `claimsMessageType(message, type)` — the cheap "is this mine at all?" check a listener filters on
  BEFORE validating, so it owns a malformed message of its own kind instead of dropping it.

### `MessagingWorkItemNoteLoader` / `MessagingWorkItemNoteWriter` (classes)

The `IWorkItemNoteLoader` / `IWorkItemNoteWriter` implementations the view depends on. Both inject
their `chrome.runtime.sendMessage` binding (`SendNotesRequest` / `SendNoteWriteRequest`), so neither
touches `chrome` directly. The **parse** lives on the content side: the worker has no reason to know
the view's model.

```typescript
const loader = new MessagingWorkItemNoteLoader(sendNotesRequest, logger);
const { notes, currentUser, error } = await loader.loadNotes({ workItemId, sinceIso });

const writer = new MessagingWorkItemNoteWriter(sendNoteWriteRequest, logger);
await writer.addNote({ workItemId, text });
await writer.editNote({ workItemId, noteId, text });
```

Neither ever throws, and neither ever logs a note's text or an author's name — the diagnostics log is
exported into bug reports, and a discussion routinely names people and customers (AGENTS.md §9).

### `fetchWorkItemNotesInPage(commentsUrl, connectionUrl, sinceIso, maxPages)`

The self-contained function the worker injects to read the discussion. It **pages**: ADO caps a
comments page regardless of the requested `$top`, so reading only the first response would hide the
older half of a busy discussion. Paging stops as soon as a page reaches past the Updates window (the
collection is requested newest-first) and `maxPages` guards a server that ignores the continuation
token. Every response is read as **text** first, so a 200 carrying ADO's HTML sign-in page is
classified as `sign-in` rather than parsed as "no notes". A failed identity read is not a failed
notes read — the panel still shows every note, it just cannot offer to edit any of them.

### `writeWorkItemNoteInPage(url, method, text)`

The self-contained function the worker injects to `POST` a new note or `PATCH` an existing one. Azure
DevOps itself rejects an edit from anyone but the note's original author, so authorization stays on
the server rather than being asserted in the page world.

Both are serialized with `Function.prototype.toString` and reference only their parameters and page
globals.

### `NoteActivityRequest` (message contract)

`READ_NOTE_ACTIVITY_MESSAGE` + `ReadNoteActivityMessage` (`{ workItemIds, excludedPrefixes }`), `RawNoteActivity`
(`{ newest, failedIds, failure, status }`), `ReadNoteActivityResponse`, and
`readNoteActivityMessageProblem(value)` — the same "reason, not a boolean" validator the notes
contract uses, and the same reason for it. The message carries ids plus bounded marker-comment
prefixes; the worker still builds every URL from the sender's own tab location, so a content script
can name WHICH items it means and which source text to omit, but never WHERE the request goes.

### `MessagingNoteActivityReader` (class)

The `INoteActivityReader` implementation the board's **New notes** filter depends on. Injects its
`chrome.runtime.sendMessage` binding (`SendNoteActivityRequest`), never throws, and keeps a **partial**
answer: the items that were read still narrow the board, the ones that were lost are reported
alongside them so a partial failure cannot look like a complete, quiet one. An empty ask is answered
without a round-trip. Counts only in the log, never a comment or an author (AGENTS.md §9).

### `fetchNoteActivityInPage(config)`

The self-contained function the worker injects to read the **whole board's** newest-comment dates in
ONE injection. Asking through `fetchWorkItemNotesInPage` instead meant an injection and a worker
round-trip per item, plus two fetches and up to 200 rendered comments each, to read one timestamp —
which is what made the first use of that filter a visible wait. Runs a small worker pool (browsers
cap concurrent same-origin requests anyway, and the board's own writes share that budget), reads each
response as **text** first so a 200 carrying ADO's sign-in page is classified as `sign-in` rather
than parsed as "no comments", skips comments beginning with any configured marker prefix, and
follows continuation pages until it finds the newest remaining comment. A page-limit cutoff is
reported in `failedIds` rather than as a null date. Only the FIRST failure is kept, so one lost
session is not reported once per item.
