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

- `TrackedUser` — a work item's user field (`displayName`, `uniqueName`, `imageUrl`, `tag`). `tag` is
  the person's Feature Crew tag, resolved from the roster after the tree loads (the ADO tree carries
  no tag): `undefined` = not yet resolved, `null` = resolved but untagged (shown as the "??" pill), a
  string = the assigned crew tag.
- `TrackedWorkItem` — the normalized work-item tree model for Project Tracking views; carries its
  `children`, ISO 8601 date strings (`createdDate`, `changedDate`, `stateChangeDate`, `eta`), typed
  user references, and `importance` (ADO's manual backlog rank — a LOWER number is more important).
  `stateChangeDate` is when `System.State` last moved, kept separate from `changedDate` so "how long
  has this been done?" is not reset by an edit that never touched the state; an item ADO returned no
  rank for hydrates as `UNRANKED_IMPORTANCE` so it sorts below every ranked one.
- `TypeCatalogEntry` — `{ name, color, icon, etaField, columns }` for each work item type in the
  hierarchy. `columns` is a `TrackedTypeColumn[]`: each column carries the board-column label (the
  team's application state) plus the ADO state names routed onto it, with `states[0]` being the
  primary state written back to ADO when a user moves an item into that column.
- `TrackedTypeColumn` — `{ column, states }` for one board column and its routed ADO states.

### `TeamIteration.ts`

- `SprintTimeFrame` — `"past" | "current" | "future"`, ADO's own classification of where an
  iteration sits relative to today (exactly one iteration is `current`).
- `TeamIteration` — `{ path, name, timeFrame }` for one of a team's iterations (sprints).
- `buildAdoIterationsUrl(href, team)` — builds the team-scoped `teamsettings/iterations` REST URL for
  a project-scoped ADO `href`, or `null` when the URL is not project-scoped or `team` is blank.
- `parseTeamIterations(body)` — best-effort parse of the raw iterations body into `TeamIteration[]`,
  preserving ADO's chronological order.

### `sprintWindow.ts`

- `SprintRelation` — `"past" | "current" | "future"`, where a windowed sprint sits relative to the
  current one; matches `SprintOption.relation` on the shared `SprintPicker` control.
- `SprintWindowEntry` — `{ path, name, label, relation }` for one decorated sprint option; `label` is
  the relative caption (e.g. `Current - Sprint 5`), `name` stays the raw sprint name used for
  filtering, and `relation` lets the picker style past/current/future entries.
- `SprintWindow` — `{ entries, currentName }`; the windowed sprints plus the name to select by default.
- `SprintWindowBounds` — `{ pastCount, futureCount }`.
- `buildSprintWindow(iterations, bounds)` — centres a window on the current sprint (falling back to
  the nearest upcoming, else the last) and labels each entry by its offset from the current one.

### `ITeamIterationsLoader.ts`

- `ITeamIterationsLoader` — loads a team's iterations in chronological order; the real implementation
  fetches from Azure DevOps, a test fake returns canned data.

### `IWorkItemTreeLoader.ts`

- `WorkItemTreeResult` — `{ isTreeQuery, roots, error, folderPath? }`; returned by the tree loader.
  `folderPath` is the query's ancestor-folder trail (outermost → nearest), trimmed to the two nearest
  folders, used for the view header breadcrumbs; the real loader always populates it, test fakes may
  omit it (treated as empty).
- `QueryFolderCrumb` — `{ label, path }` for one folder in the trail: `label` is the folder's own
  name (what the breadcrumb shows); `path` is its full path from the root (root container included)
  so a caller can build the folder's ADO link.
- `IWorkItemTreeLoader` — loads a query's work items into the `TrackedWorkItem` tree; the real
  implementation fetches from Azure DevOps, a placeholder returns empty + a "coming soon" message.

### `IUserDirectory.ts`

- `DirectoryUser` — `{ displayName, uniqueName, imageUrl }` from an identity search or roster.
- `IUserDirectory` — `{ search(query), resolve(nameOrUnique) }`; queries the user directory for
  assignee-pickers and identity resolution.

### `fetchAdoIdentities.ts`

- `buildAdoIdentitySearchRequest(href, query)` — parses the org from the tab URL and returns the
  `{ url, body }` for the org-scoped Identity Picker search (the same endpoint ADO's own people
  picker calls, so it resolves anyone the signed-in user could assign work to). The body is kept to
  the shape a known-good client uses; nothing speculative is added to it, because this is a preview
  API and every extra field is one more thing it can reject. Returns `null` for a non-project URL or
  a query shorter than `MIN_IDENTITY_SEARCH_LENGTH`.
- `parseAdoIdentities(body)` — turns the raw picker body into `DirectoryUser[]` in ADO's ranked
  order, de-duplicating the same person across operation scopes; **best-effort** (a missing/malformed
  body yields `[]`). The identity groups are read from a `results` envelope, a `value` envelope, or a
  bare array. Identities flagged `active:false` are **kept**: that flag means "not a member of this
  organization (yet)", which describes every hit from the backing directory — the people the search
  exists to find.
- `MIN_IDENTITY_SEARCH_LENGTH` — the shortest query worth a directory round-trip (a picker filters
  its in-memory suggestions below it).
- `IDENTITY_SEARCH_MAX_RESULTS` — how many identities one search asks for.

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
  `{ wiqlUrl, batchUrl, queryUrl }` to fetch for running a saved tree query, or `null` for a
  non-project URL. `queryUrl` is the query-metadata endpoint, read for the query's folder `path`.
- `buildWorkItemUpdateUrl(href, id)` — parses the org from the tab URL and returns the org-scoped
  work-item update URL (`{base}/_apis/wit/workitems/{id}?api-version=7.1`), or `null` for a
  non-ADO/unresolvable URL. Work items are org-scoped, not project-scoped, so the project segment is
  discarded from the URL.
- `parseTrackedTree(raw, etaFieldByType)` — parses the raw WIQL + batch REST bodies into the
  normalized `TrackedWorkItem` tree; **best-effort** (missing/malformed input yields
  `{ isTreeQuery:false, roots:[], error, folderPath }` or an empty tree). Guards cycles and depth.
  Accepts batch items as either a bare array or `{ value: [...] }`. Hydrates each node's fields from
  the batch, strips HTML from descriptions, decodes entities, and pulls ETA from the per-type field
  map. Also derives `folderPath` from the optional query-metadata body via `parseQueryFolderPath`.
- `parseQueryFolderPath(rawQuery)` — extracts the query's ancestor-folder trail (outermost → nearest)
  from the raw query-metadata body as `QueryFolderCrumb[]`: splits its `path` on either separator
  (`/` or `\`), drops the leaf (the query's own name) and the built-in root container
  (`Shared Queries`/`My Queries`) from the display, and keeps only the two nearest folders (parent +
  grandparent). Each crumb still carries its full path (root included) so its link resolves. A query
  saved directly under a root yields `[]`. **Best-effort** (missing/malformed body yields `[]`).
- `buildQueryFolderUrl(href, folderPath)` — builds the ADO query-hub folder link
  (`{base}/{project}/_queries/folder/?path={path}`) that opens a folder's contents, percent-encoding
  each path segment while keeping the separators literal; `null` when `href` is not a project-scoped
  ADO URL.
- `buildWorkItemUrl(href, id)` — builds the human-facing work item deep link
  (`{base}/{project}/_workitems/edit/{id}`) a view hands to an anchor; `null` when `href` is not a
  project-scoped ADO URL. This is the **web** link, not the REST endpoint (`buildWorkItemUpdateUrl`).
- `TRACKING_FIELDS` — the readonly array of System.* field reference names fetched for tree queries.
- `AdoRawTree` — `{ wiql, items, query? }` shape wrapping the raw REST bodies before parsing;
  `query` is the best-effort query-metadata body (may be absent when that read fails).
- `AdoTreeUrls` — `{ wiqlUrl, batchUrl, queryUrl }` shape `buildAdoTreeUrls` returns.

### `FeatureCrew.ts`

- `FeatureCrewMember` — one roster line: `{ alias, fullName, tag }`. `FeatureCrewAssignee` —
  `{ alias, fullName }`, a person distilled to what a roster line needs.
- `deriveAlias` / `collectFeatureCrewAssignees` / `parseFeatureCrewDescription` /
  `formatFeatureCrewDescription` / `mergeFeatureCrew` / `buildFeatureCrewUrls` — the pure value logic
  that parses, formats, merges, and locates the roster item (the credentialed reads/writes run in the
  ADO page's MAIN world).
- `applyFeatureCrewTags(roots, members)` — projects each roster member's tag onto the matching
  `assignedTo` across the tree (matched by alias, case-insensitively); a person absent from the roster
  or with an empty tag is set to `null` (the neutral "??" bucket).
- `collectAssignedTags(roots)` — the distinct tags worn by assigned people across the tree, first-seen
  order, with `null` (the "??" bucket) appended last when any assignee has no tag. Unassigned items
  contribute nothing.
- `collectAssignedDirectoryUsers(roots)` — the distinct assignees across the tree as `TrackedUser`s
  (first-seen order), each keeping the crew tag `applyFeatureCrewTags` projected onto them — the crew
  an assignee picker offers, and tags, before anything is typed. Read from the tree rather than the
  persisted roster because only the tree carries each person's unique name.

### `adoApi.ts`

- `ADO_API_VERSION` — the REST API version every request in the extension targets.
- `ASSIGNED_TO_FIELD` — the assignee field's reference name, named once because it is both requested
  with the tree and patched back when a view reassigns an item.
- `identityFieldValue(user)` — the string an identity field is patched with for a picked person: the
  unique name when known (ADO resolves identities from it), otherwise the display name.

### `IFeatureCrewWriter.ts`

- `FeatureCrewReconcileRequest` — `{ rootId, typeName, assignees }`; the request to reconcile a
  Feature Crew work item (create or update the roster so it contains all currently assigned people).
- `FeatureCrewReconcileResult` — `{ ok, changed, id?, members? }`; the result of reconciling the
  Feature Crew work item; `ok` indicates success, `changed` is true when at least one person was added
  to the roster, `id` is the Feature Crew work item's id when the reconcile succeeded, and `members`
  is the reconciled roster (each person with their hand-set tag) so callers can project tags onto the
  tree.
- `IFeatureCrewWriter` — reconciles the Feature Crew work item: finds or creates the dedicated roster
  (a single item parked in `Removed` with a fixed title and "Affected By" relation to the project
  root), merges the given assignees into it, and patches when at least one person was added. The real
  implementation injects a credentialed fetch into the ADO tab's page (MAIN) world; a test fake
  returns canned results.

### `IWorkItemFieldWriter.ts`

- `WorkItemFieldWriteRequest` — `{ id, rev, field, value }`; the request to write a single work item
  field back to Azure DevOps. `field` is the ADO field reference name (e.g. `System.State` or a
  type's ETA date field) and `value` is the new value, or `null` to clear the field. Includes the
  item's last-known `rev` as an optimistic-concurrency guard so the PATCH fails when the item was
  edited concurrently by someone else (its rev advanced).
- `WorkItemFieldWriteResult` — `{ ok, rev?, error? }`; the result of writing a work item field;
  `ok` indicates success, `rev` is the item's new System.Rev after a successful write, and `error` is
  a short description when `ok` is false.
- `IWorkItemFieldWriter` — writes a single work item field back to Azure DevOps. The real
  implementation injects a credentialed PATCH into the ADO tab's MAIN world; a test fake returns
  canned results.

### `FieldWriteQueue/`

- `FieldWriteQueue` — a strictly-sequential queue for work-item field writes. Serializes every
  `writeField` call so ordering is deterministic and no two writes race on `System.Rev`
  (ADR-030). `enqueue` always resolves (never rejects), and a failed write never stalls the chain.
  See [`FieldWriteQueue/README.md`](./FieldWriteQueue/README.md).

## Usage guidance

- The **options-page reader** (`ChromeAdoMetadataReader` in `src/common/browser`) calls
  `buildAdoMetadataUrls`, injects `fetchAdoRawInPage` into the ADO tab to get the raw JSON, then
  applies `parseTeams` / `flattenAreaPaths` / `parseWorkItemTypes` (passing the date-field reference
  names from `parseDateFieldReferenceNames`). It is the only place that touches chrome APIs.
- Everything here is pure: tests pass URLs/bodies directly and never touch the network.
