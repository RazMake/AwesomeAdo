# src/common/ado

Azure DevOps project metadata for the options page: the list of **teams** and the project's **work
item types** (each with its states), plus the pure helpers that build the REST URLs and parse the
responses.

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
- `AdoMetadata` — `{ teams: AdoTeam[]; workItemTypes: AdoWorkItemType[] }`.
- `EMPTY_ADO_METADATA` — the `{ teams: [], workItemTypes: [] }` fallback so callers never see
  `undefined`.

### `TrackedWorkItem.ts`

- `TrackedUser` — a work item's user field (`displayName`, `uniqueName`, `imageUrl`, `tag`). `tag` is
  the person's Feature Crew tag, resolved from the roster after the tree loads (the ADO tree carries
  no tag): `undefined` = not yet resolved, `null` = resolved but untagged (shown as the "??" pill), a
  string = the assigned crew tag.
- `TrackedWorkItem` — the normalized work-item tree model for Project Tracking views; carries its
  `children`, ISO 8601 date strings (`createdDate`, `changedDate`, `stateChangeDate`, `eta`), typed
  user references, the full `areaPath` (`System.AreaPath`, or `null` when absent),
  `priority` (`Microsoft.VSTS.Common.Priority`, or `null` when absent), and
  `importance` (ADO's manual backlog rank — a LOWER number is more important).
  `stateChangeDate` is when `System.State` last moved, kept separate from `changedDate` so "how long
  has this been done?" is not reset by an edit that never touched the state; an item ADO returned no
  rank for hydrates as `UNRANKED_IMPORTANCE` so it sorts below every ranked one. `description` is
  kept **exactly as ADO stored it** (rich-text HTML or Markdown, never flattened) so the view can
  render embedded images and `@`-mentions. `noteCount` is `System.CommentCount` — a TOTAL, so treat
  it as "worth opening", not as "has notes inside the Updates window". `tags` is `System.Tags`
  already split into a list (see `workItemTags.ts`), because every consumer asks "does it carry this
  tag?" rather than "what does the field say".
- `TypeCatalogEntry` — `{ name, color, icon, isPrimaryWork, etaField, columns, children }` for each
  work item type in the hierarchy. `isPrimaryWork` distinguishes independently trackable delivery
  from planning context and implementation detail. `columns` is a `TrackedTypeColumn[]`: each column
  carries the board-column label (the team's application state) plus the ADO state names routed onto
  it, with `states[0]` being the primary state written back to ADO when a user moves an item into that
  column.
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

### `TeamMembers.ts`

- `TeamMember` - the normalized identity fields needed by a team filter pill.
- `TeamMembersResult` - a roster plus an explicit error, preserving the difference between an empty
  team and a failed read.
- `TeamMembersLoader` - loads every member of one configured team.
- `buildAdoTeamMembersUrl(href, team)` - builds the paged project/team members URL.
- `parseTeamMembers(body)` - validates and deduplicates ADO team-member identities by id.

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

- `DirectoryUser` — `{ id?, displayName, uniqueName, imageUrl }` from an identity search or roster;
  `id` is the local ADO identity GUID needed to author an `@<id>` mention when the picker supplies it.
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

### `IMentionDirectory.ts`

- `IMentionDirectory` — `{ resolveNames(ids), knownNames() }`. Resolves the identity GUIDs an
  `@`-mention is stored as into display names, keyed by **lowercase** GUID. Deliberately separate
  from `IUserDirectory` (Interface Segregation): that one searches for a person a user is choosing
  between, this one answers "who are these ids?" for content that is already written.
  `resolveNames` is **bulk by contract** and never rejects; ids it could not resolve are simply
  absent. `knownNames()` is the synchronous view of what has been resolved so far, for renderers
  that paint synchronously.

### `mentionIdentities.ts`

- `collectMentionIdentityIds(sources)` — every identity GUID mentioned across the given texts,
  lowercased and de-duplicated in first-seen order. Finds **both** encodings ADO uses: the Markdown
  token (`@<guid>`) and the rich-text mention anchor (`data-vss-mention="version:2.0,guid"`).
- `buildAdoIdentityNamesUrls(href, ids)` — the bulk `_apis/identities?identityIds=…` URLs for the
  organization that owns `href`, one per batch; `[]` when the URL is not ADO or no id is usable.
  Anything that is not a well-formed GUID is **dropped**, because the ids are content-supplied and
  are interpolated into a query string.
- `parseAdoIdentityNames(bodies)` — the batch bodies as a `Map` of lowercase GUID → display name
  (custom display name, else the provider's, else the sign-in account); **best-effort** (a
  missing/malformed body contributes nothing).
- `MENTION_TOKEN_PATTERN` — the Markdown mention shape, as a pattern **source**. Shared with
  `view-common/control/MarkdownText` so the collector and the renderer agree on one token shape; a
  source rather than a `RegExp` because a global regex carries a mutable `lastIndex`.
- `MENTION_BATCH_SIZE` / `MAX_MENTION_IDS` — how many ids ride in one URL, and the ceiling on one
  request.

### `fetchAdoMetadata.ts`

- `buildAdoMetadataUrls(href)` — parses the org/project from the tab URL and returns the
  `{ teamsUrl, workItemTypesUrl, fieldsUrl, areaPathsUrl }` to fetch, or `null` for a non-project
  (org/folder) URL.
- `parseTeams(body)` — turns the raw teams REST body into a sorted `AdoTeam[]`; **best-effort** (a
  missing/malformed body yields `[]`).
- `parseAreaPaths(body)` — flattens the project classification tree into deduplicated, sorted full
  `System.AreaPath` values for options-page autocomplete; **best-effort** like `parseTeams`.
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
- `resolveAdoIdentityServiceBase(href)` — the base for the organization's **identity** service, or
  `null` when the href is not ADO. This is the one read in this folder that is **not** served from
  the collection base: bulk identity reads live on `vssps.dev.azure.com/{org}` (or
  `{org}.vssps.visualstudio.com`), so a request built from it is a genuine cross-origin hop. No
  project is needed — identities are org-scoped.
- `resolveAdoProjectContext(href)` — resolves the `{ base, project }` (collection base URL +
  URL-encoded project) for a project-scoped ADO href, or `null` when the URL is not project-scoped.
  Shared by `buildAdoMetadataUrls` and `fetchAdoTree`'s `buildAdoTreeUrls` so the parse-and-encode
  boilerplate lives in one place.
- `buildTeamScopedApiUrl(href, team, path, apiVersion)` — builds a **team**-scoped REST URL
  (`{base}/{project}/{team}/_apis/{path}?api-version=…`), or `null` when the href is not
  project-scoped or `team` is blank. Shared by every team-owned endpoint (a team's iterations, its
  backlog order) so they cannot drift on encoding or on the "no team means no URL" rule.
  `apiVersion` is a parameter because not every team-scoped route has left preview.
- `AdoMetadataUrls` — the `{ teamsUrl, workItemTypesUrl, fieldsUrl }` shape
  `buildAdoMetadataUrls` returns.

### `adoAttachment.ts`

- `buildAdoAttachmentUrl(pageHref, reference)` — the REST URL an image embedded in ADO rich text must
  be fetched from, or `null` when `reference` is not an ADO attachment reference (or `pageHref` is not
  an ADO page). ADO's rendered notes and descriptions point at a pasted screenshot with the
  attachment's **bare id** (`4f76001f-…?fileName=image.png`); this turns that into
  `{collectionBase}/_apis/wit/attachments/{id}?fileName=…&api-version=7.1`, the request ADO's own UI
  makes. Org-scoped, so it also works on pages that name no project.

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
  Accepts batch items as either a bare array or `{ value: [...] }`. Hydrates each node's fields,
  including its full area path, from the batch; strips HTML from descriptions; decodes entities; and
  pulls ETA from the per-type field map. Also derives `folderPath` from the optional query-metadata
  body via `parseQueryFolderPath`.
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
- `TRACKING_FIELDS` — the readonly array of field reference names fetched for tree queries, including
  `AREA_PATH_FIELD` (`System.AreaPath`) for in-view filtering and item-menu changes.
- `AdoRawTree` — `{ wiql, items, query? }` shape wrapping the raw REST bodies before parsing;
  `query` is the best-effort query-metadata body (may be absent when that read fails).
- `AdoTreeUrls` — `{ wiqlUrl, batchUrl, queryUrl }` shape `buildAdoTreeUrls` returns.

### `QueryDefinition.ts` and `sprintQuery.ts`

- `buildAdoQueryDefinitionUrl` / `parseQueryDefinition` read a saved query's original expanded WIQL.
- `wiqlForSprint` replaces an existing `@CurrentIteration` or `@CurrentSprint` offset from that
  original body, and `filterTreeForSprintRoster` keeps team members, unassigned work, and only
  the parent chains needed to reach them.

### `workItemTags.ts`

Reading and rewriting `System.Tags`, which Azure DevOps stores as ONE semicolon-separated string and
compares **case-insensitively** while preserving the casing first used. Pure, so the tree parser, the
board's filters and the tagging commands all share one interpretation of the field.

- `parseWorkItemTags(raw)` — splits the field into trimmed, non-empty tags; `[]` for a non-string.
- `formatWorkItemTags(tags)` — joins them back the way ADO stores them (`"A; B"`); `""` clears the field.
- `hasWorkItemTag(tags, tag)` — case-insensitive membership. A **blank** `tag` never matches, so an
  unconfigured marker reads as absent rather than as present on everything.
- `withWorkItemTag(tags, tag)` / `withoutWorkItemTag(tags, tag)` — the list with a tag added (last,
  so existing order and casing survive) or every case-insensitive match removed.

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
- `IMPORTANCE_FIELD` — ADO's manual backlog rank (`Microsoft.VSTS.Common.StackRank`), named once for
  the same reason: the tree **reads** it to order a level and `rankFallback` **writes** it when ADO
  refuses to order an item itself.
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

- `WorkItemFieldWriteRequest` — `{ id, rev, field, value, additionalFields?, preconditions? }`; the request to write
  one user action back to Azure DevOps. `field` is the primary ADO field reference name (e.g. `System.State` or a
  type's ETA date field) and `value` is the new value, or `null` to clear the field. Includes the
  item's last-known `rev` as an optimistic-concurrency guard so the PATCH fails when the item was
  edited concurrently by someone else (its rev advanced). Optional `baseValue` names the value the
  field held when the change was computed from it; supplying it lets the write be retried once
  against the server's current rev when — and only when — the field itself has not moved, which is
  what keeps an edit alive across the rev bumps nothing reports back (a drag-reorder, the rank
  fallback, a note posted through the comments API). `additionalFields` carries other field/value
  pairs changed by that same action so all of them land in one guarded JSON Patch and one revision.
  `preconditions` carries a bounded set of other field/value pairs that must still match; each is a
  JSON Patch `test` before any write, for actions whose safety depends on more than the primary field.
- `WorkItemFieldWriteResult` — `{ ok, rev?, error? }`; the result of writing a work item field;
  `ok` indicates success, `rev` is the item's new System.Rev after a successful write, and `error` is
  a short description when `ok` is false.
- `IWorkItemFieldWriter` — writes one atomic work-item field change set back to Azure DevOps. The real
  implementation injects a credentialed PATCH into the ADO tab's MAIN world; a test fake returns
  canned results.

### `IWorkItemReorderWriter.ts`

- `WorkItemReorderRequest` —
  `{ id, rev, parentId, currentParentId, previousId, nextId, siblingIds, type?, stateName?, stateBaseName?, team }`; the request to move
  an item. Position is named as the two siblings it lands **between** (`0` = start / end / no parent)
  rather than as a rank, because ADO owns the rank arithmetic — and naming neighbours survives a stale
  board, where two independently-computed ranks would collide. `siblingIds` is the destination level
  in its **post-drop** order, which the rank fallback needs when ADO declines to rank the item.
  `type`, when present, is the destination parent's default child type and is applied atomically with
  the parent link. `stateName` and `stateBaseName` coordinate a conflict-safe state patch before rank
  placement in the same queue action.
- `WorkItemReorderResult` — `{ ok, order?, rev?, reparented?, stateChanged?, ranks?, error? }`; `order` is the rank
  ADO assigned (so a caller can refresh its model without re-reading the tree), `rev` the item's new
  rev when the re-parent patch ran, `reparented` whether the hierarchy link actually changed (reported
  on failure too, so a caller never keeps showing a parent ADO has already moved the item away from),
  `stateChanged` whether the optional state patch landed before a later rank failure, and `ranks`
  every rank written directly when ADO refused to order the item.
- `IWorkItemReorderWriter` — moves a work item within or between parents. Kept separate from
  `IWorkItemFieldWriter` (Interface Segregation): a re-parent changes the item's **links** and its
  rank lives behind a team-scoped backlog endpoint, so neither is a field patch, and a consumer that
  only edits fields must not be handed the ability to restructure a tree.

### `reorderWorkItems.ts`

- `buildWorkItemsOrderUrl(href, team)` — the team-scoped backlog-order endpoint
  (`_apis/work/workitemsorder`), or `null` for a non-project URL or a blank team.
- `WORK_ITEMS_ORDER_API_VERSION` — that endpoint's api-version. Deliberately **not**
  `ADO_API_VERSION`: the route has never left preview and ADO rejects a plain `7.1` on it, so the
  preview suffix is pinned beside the one URL that needs it.
- `buildWorkItemRelationsUrl(href, id)` — reads one item **with its links**, the only way to learn the
  index JSON Patch needs to remove the existing parent relation.
- `buildWorkItemLinkUrl(href, id)` — the item's identity as a link target (the `url` written into a
  new parent relation). Carries **no** api-version: it is an identity, not a request.
- `PARENT_LINK_TYPE` — ADO's child→parent link type (`System.LinkTypes.Hierarchy-Reverse`).
- `parseReorderedRank(body, id)` — the new rank from a `ReorderResult[]` body (bare array or
  `{ value: [...] }`), or `null` when absent/unusable so a caller never trusts a fabricated rank.

### `rankFallback.ts`

Ranks a level by writing `IMPORTANCE_FIELD` directly, for the moves ADO's backlog-order endpoint
refuses. That endpoint only ranks items that already hold a position on the team's backlog: an item
with no rank yet — or one nested under a parent of its own category, which Azure Boards does not order
at all — gets `TF400486` every single time, so retrying is pointless and writing the rank is the only
way the drop can stick.

- `applyRankFallback({ siblingIds, movedId, readRanks, writeRanks })` — the whole operation: read the
  level's current ranks, work out what to write, write it, and report `{ ok, order?, ranks?,
reseeded?, error? }`. The two IO steps are **injected** because the real calls must run in the ADO
  tab's MAIN world; that keeps every decision here unit-testable.
- `planRankWrites(siblingIds, rankById, movedId)` — the arithmetic on its own: the midpoint of the
  neighbours' gap when there is one, a full `RANK_SPACING` step past the only neighbour at either end,
  or a whole-level renumber (anchored to the level's lowest existing rank) when nothing fits. `null`
  when the moved item is not in the level, which means the caller's view is stale.
- `RANK_SPACING` — the gap left between consecutive ranks when this module assigns them.
- `buildWorkItemsBatchUrl(href)` / `pageWorkItemIds(ids)` / `parseWorkItemRanks(body, field)` — the
  batch read's URL, its 200-id paging, and the ranks read out of its body. An item with **no** rank is
  deliberately absent from the map rather than present as `0`.

### `WorkItemWriteQueue/`

- `WorkItemWriteQueue` — a strictly-sequential queue for work-item writes. Serializes every
  `writeField` **and** every reorder so ordering is deterministic and no two writes race on
  `System.Rev` (ADR-030). Both entry points always resolve (never reject), and a failed write never
  stalls the chain. See [`WorkItemWriteQueue/README.md`](./WorkItemWriteQueue/README.md).

### `WorkItemNote.ts`

The normalized model for a work item **note** — one entry in its Azure DevOps Discussion.

- `NoteAuthor` — `{ displayName, id, uniqueName }`; `id` is the ADO identity GUID and `uniqueName`
  the sign-in address, either of which may be `null`.
- `WorkItemNote` — `{ id, workItemId, author, createdDate, text, renderedHtml }`. `text` is the
  Markdown/rich-text **source** (what an edit re-opens); `renderedHtml` is ADO's own rendering, which
  is where an `@`-mention carries the person's name instead of their GUID.
- `MAX_NOTE_LENGTH` — the longest note this extension will author; the composer stops there and the
  message contract refuses past it.
- `noteWindowStart(now, weeks)` — the ISO start of the Updates window, so the fetch and the list
  narrow by exactly the same instant.
- `sortNotesNewestFirst(notes)` — non-mutating; an unparseable date sorts last.
- `selectRecentNoteDays(notes)` — the notes from the two most recent **local calendar days that have
  notes**, complete: a burst of updates in one afternoon is never cut in half.
- `isOwnNote(note, reader)` — identity GUID first, sign-in address second; display names are never
  compared, because two people routinely share one.

### `fetchWorkItemNotes.ts`

- `buildWorkItemNotesUrls(href, workItemId)` — the comments URL (newest first, `$expand=renderedText`
  so mentions resolve to names) plus the org's `ConnectionData` URL; `null` when `href` is not
  project-scoped. `ConnectionData` is pinned to `ADO_CONNECTION_DATA_API_VERSION`, a **preview**
  version: it is served under no other kind, and a released one answers `400` with an error envelope
  that parses as "nobody is signed in".
- `buildAddNoteUrl(href, workItemId)` / `buildEditNoteUrl(href, workItemId, noteId)` — the Markdown
  (`format=0`) write endpoints; `null` when `href` is not project-scoped.
- `parseCurrentUser(rawConnection)` — the signed-in `NoteAuthor`, or `null` when neither handle is
  present (no note is then editable).
- `parseWorkItemNotes(rawPages, workItemId, sinceIso)` — the notes inside the Updates window.
- `parseWorkItemNote(rawComment, workItemId)` — one note; `null` without a numeric id and a parseable
  `createdDate`.
- `NOTES_PAGE_SIZE` — the largest page ADO serves from the comments collection.

### `IWorkItemNoteLoader.ts`

- `WorkItemNotesRequest` — `{ workItemId, sinceIso }`.
- `WorkItemNotesResult` — `{ notes, currentUser, error }`. The reader travels with the notes because
  a view can only offer "edit" on the notes that person wrote, and ADO answers both from the same
  credentialed page context.
- `IWorkItemNoteLoader` — `loadNotes(request)`.

### `IWorkItemNoteWriter.ts`

- `AddNoteRequest` — `{ workItemId, text }`; `EditNoteRequest` — `{ workItemId, noteId, text }`.
- `NoteWriteResult` — `{ ok, note?, error? }`; the saved note comes back so a list can show exactly
  what ADO stored rather than echoing what was typed.
- `IWorkItemNoteWriter` — `addNote` / `editNote`. Kept separate from the loader (Interface
  Segregation): showing notes and authoring them are different capabilities.

### `INoteActivityReader.ts` + `fetchNoteActivity.ts`

Answers "when was each of these last commented on?" for many items at once — the board's **New
notes** filter. Kept apart from the note loader for the same Interface-Segregation reason the writer
is, and for a blunt cost reason: the loader fetches two credentialed URLs and up to 200
`$expand=renderedText` comments **per item**, one round-trip at a time, and all this needs is one
timestamp each.

- `NoteActivityRequest` — `{ workItemIds, excludedPrefixes }`; `NoteActivity` —
  `{ workItemId, newestNoteDate }`. Prefixes identify marker-generated comments that must not count.
- `NoteActivityResult` — `{ activity, error }`. An item whose read failed is **absent** from
  `activity` rather than dated `null`, so "nobody commented" and "nobody could find out" stay apart.
- `INoteActivityReader` — `readNoteActivity(request)`.
- `buildNewestNoteUrl(href, workItemId)` — one newest-first source page, no `$expand`; the page-world
  reader follows continuation tokens only while every comment seen is excluded.
- `parseNewestNoteDate(rawPage)` — the newest comment's ISO date, or `null`; never throws, because
  one odd response must not lose the rest of the board.
- `MAX_NOTE_ACTIVITY_ITEMS`, `MAX_NOTE_ACTIVITY_PAGES`, and the prefix bounds are runaway guards on
  one bulk ask, not expected user limits.

### `IInterruptAcceptanceReader.ts` + `interruptAcceptance.ts`

Resolves whether each currently Interrupt-tagged item was accepted during its **current** tagged
lifetime. `isInterruptAccepted` requires a configured acceptance token in `System.History` at or
after the latest update that added the configured Interrupt tag; equality is valid because tagging
as accepted writes both in one revision. Failed items are returned separately and never treated as
unaccepted. `fetchInterruptAcceptance.ts` builds the sender-project-scoped, `$skip`-paged work-item
updates URL and owns request/page/marker length guards.

## Usage guidance

- The **options-page reader** (`ChromeAdoMetadataReader` in `src/common/browser`) calls
  `buildAdoMetadataUrls`, injects `fetchAdoRawInPage` into the ADO tab to get the raw JSON, then
  applies `parseTeams` / `parseWorkItemTypes` (passing the date-field reference names from
  `parseDateFieldReferenceNames`). It is the only place that touches chrome APIs.
- Everything here is pure: tests pass URLs/bodies directly and never touch the network.
