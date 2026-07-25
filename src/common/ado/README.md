# src/common/ado

Azure DevOps project metadata for the options page: the list of **teams**, the project's
**area paths**, and its **work item types** (each with its states), plus the pure helpers that build
the REST URLs and parse the responses.

## Why this exists

The options page runs on the `chrome-extension://` origin, so it cannot call the ADO REST APIs with
the user's session credentials directly. The credentialed fetch is instead injected into the ADO
tab's **page (MAIN) world** (see `src/common/browser/fetchAdoRawInPage.ts`) — the only context that
is both same-origin with the APIs and carries the user's SameSite session cookies. This folder holds
the chrome-free, browser-agnostic pieces of that flow: the data shapes plus the URL-building and
response-parsing logic, kept pure so they are unit-testable without a browser.

## Public API

### `AdoMetadata.ts`

- `AdoTeam` — `{ id, name }` for one team.
- `AdoWorkItemField` — `{ referenceName, name }` for one ADO field; `referenceName` is the stable id
  that gets persisted, `name` is the friendly label shown in the picker.
- `AdoWorkItemType` — `{ name, color, icon, states, dateFields }` for one enabled work item type;
  `color` is ADO's hex string (no `#`), `icon` is the type glyph's URL, `states` are the type's state
  names, and `dateFields` are the date-typed fields (`AdoWorkItemField[]`) offered as the type's ETA.
- `AdoMetadata` — `{ teams: AdoTeam[]; areaPaths: string[]; workItemTypes: AdoWorkItemType[] }`;
  `areaPaths` are user-facing strings such as `Project\Area\Team`.
- `EMPTY_ADO_METADATA` — the `{ teams: [], areaPaths: [], workItemTypes: [] }` fallback so callers
  never see `undefined`.

### `TrackedWorkItem.ts`

- `TrackedUser` — a work item's user field (`displayName`, `uniqueName`, `imageUrl`).
- `TrackedWorkItem` — the normalized work-item tree model for Project Tracking views; carries its
  `children`, ISO 8601 date strings (`createdDate`, `changedDate`, `eta`), and typed user references.
- `TypeCatalogEntry` — `{ name, color, icon, etaField, columns }` for each work item type in the
  hierarchy. `columns` is a `TrackedTypeColumn[]`: each column carries the board-column label (the
  team's application state) plus the ADO state names routed onto it, with `states[0]` being the
  primary state written back to ADO when a user moves an item into that column.
- `TrackedTypeColumn` — `{ column, states }` for one board column and its routed ADO states.
- `SprintRef` — `{ path, name }` for sprint references.

### `IWorkItemTreeLoader.ts`

- `WorkItemTreeResult` — `{ isTreeQuery, roots, error }`; returned by the tree loader.
- `IWorkItemTreeLoader` — loads a query's work items into the `TrackedWorkItem` tree; the real
  implementation fetches from Azure DevOps, a placeholder returns empty + a "coming soon" message.

### `IUserDirectory.ts`

- `DirectoryUser` — `{ displayName, uniqueName, imageUrl }` from an identity search or roster.
- `IUserDirectory` — `{ search(query), resolve(nameOrUnique) }`; queries the user directory for
  assignee-pickers and identity resolution.

### `fetchAdoMetadata.ts`

- `buildAdoMetadataUrls(href)` — parses the org/project from the tab URL and returns the
  `{ teamsUrl, areaPathsUrl, workItemTypesUrl, fieldsUrl }` to fetch, or `null` for a non-project
  (org/folder) URL.
- `parseTeams(body)` — turns the raw teams REST body into a sorted `AdoTeam[]`; **best-effort** (a
  missing/malformed body yields `[]`).
- `flattenAreaPaths(root)` — flattens the raw classification tree into `Project\Area` strings.
- `parseWorkItemTypes(body, dateFieldReferenceNames?)` — turns the raw work-item-types REST body into
  a sorted `AdoWorkItemType[]`, dropping disabled types; **best-effort** like `parseTeams`. The list
  endpoint returns each type's states and field list inline, but not the fields' data types, so pass
  the set from `parseDateFieldReferenceNames` to attach each type's date fields (omit it and every
  type's `dateFields` is empty).
- `parseDateFieldReferenceNames(body)` — turns the raw project field-list body into the `Set` of
  reference names whose field type is `dateTime`, **excluding** well-known platform-managed lifecycle
  dates (Created, Changed/Modified, Resolved, Closed, Activated, State Change, Authorized, Revised)
  so only user-chosen target dates are offered as an ETA; **best-effort** (a missing/malformed body
  yields an empty set).
- `adoCollectionBaseUrl` — the small pure helper the URLs share, exported for focused testing.
- `resolveAdoProjectContext(href)` — resolves the `{ base, project }` (collection base URL +
  URL-encoded project) for a project-scoped ADO href, or `null` when the URL is not project-scoped.
  Shared by `buildAdoMetadataUrls` and `fetchAdoTree`'s `buildAdoTreeUrls` so the parse-and-encode
  boilerplate lives in one place.
- `AdoMetadataUrls` — the `{ teamsUrl, areaPathsUrl, workItemTypesUrl, fieldsUrl }` shape
  `buildAdoMetadataUrls` returns.

### `fetchAdoTree.ts`

- `buildAdoTreeUrls(href, queryId)` — parses the org/project from the tab URL and returns the
  `{ wiqlUrl, batchUrl }` to fetch for running a saved tree query, or `null` for a non-project URL.
- `buildWorkItemUpdateUrl(href, id)` — parses the org from the tab URL and returns the org-scoped
  work-item update URL (`{base}/_apis/wit/workitems/{id}?api-version=7.1`), or `null` for a
  non-ADO/unresolvable URL. Work items are org-scoped, not project-scoped, so the project segment is
  discarded from the URL.
- `parseTrackedTree(raw, etaFieldByType)` — parses the raw WIQL + batch REST bodies into the
  normalized `TrackedWorkItem` tree; **best-effort** (missing/malformed input yields
  `{ isTreeQuery:false, roots:[], error }` or an empty tree). Guards cycles and depth. Accepts batch
  items as either a bare array or `{ value: [...] }`. Hydrates each node's fields from the batch,
  strips HTML from descriptions, decodes entities, and pulls ETA from the per-type field map.
- `TRACKING_FIELDS` — the readonly array of System.* field reference names fetched for tree queries.
- `AdoRawTree` — `{ wiql, items }` shape wrapping the raw REST bodies before parsing.
- `AdoTreeUrls` — `{ wiqlUrl, batchUrl }` shape `buildAdoTreeUrls` returns.

### `IFeatureCrewWriter.ts`

- `FeatureCrewReconcileRequest` — `{ rootId, typeName, assignees }`; the request to reconcile a
  Feature Crew work item (create or update the roster so it contains all currently assigned people).
- `FeatureCrewReconcileResult` — `{ ok, changed, id? }`; the result of reconciling the Feature Crew
  work item; `ok` indicates success, `changed` is true when at least one person was added to the
  roster, and `id` is the Feature Crew work item's id when the reconcile succeeded.
- `IFeatureCrewWriter` — reconciles the Feature Crew work item: finds or creates the dedicated roster
  (a single item parked in `Removed` with a fixed title and "Affected By" relation to the project
  root), merges the given assignees into it, and patches when at least one person was added. The real
  implementation injects a credentialed fetch into the ADO tab's page (MAIN) world; a test fake
  returns canned results.

### `IWorkItemStateWriter.ts`

- `WorkItemStateWriteRequest` — `{ id, rev, state }`; the request to write a work item's state back
  to Azure DevOps. Includes the item's last-known `rev` as an optimistic-concurrency guard so the
  PATCH fails when the item was edited concurrently by someone else (its rev advanced).
- `WorkItemStateWriteResult` — `{ ok, rev?, error? }`; the result of writing a work item's state;
  `ok` indicates success, `rev` is the item's new System.Rev after a successful write, and `error` is
  a short description when `ok` is false.
- `IWorkItemStateWriter` — writes a work item's state (System.State) back to Azure DevOps. The real
  implementation injects a credentialed PATCH into the ADO tab's MAIN world; a test fake returns
  canned results.
  returns canned results.

### `StateWriteQueue/`

- `StateWriteQueue` — a strictly-sequential queue for work-item state writes. Serializes every
  `writeState` call so ordering is deterministic and no two writes race on `System.Rev`
  (ADR-030). `enqueue` always resolves (never rejects), and a failed write never stalls the chain.
  See [`StateWriteQueue/README.md`](./StateWriteQueue/README.md).

## Usage guidance

- The **options-page reader** (`ChromeAdoMetadataReader` in `src/common/browser`) calls
  `buildAdoMetadataUrls`, injects `fetchAdoRawInPage` into the ADO tab to get the raw JSON, then
  applies `parseTeams` / `flattenAreaPaths` / `parseWorkItemTypes` (passing the date-field reference
  names from `parseDateFieldReferenceNames`). It is the only place that touches chrome APIs.
- Everything here is pure: tests pass URLs/bodies directly and never touch the network.
