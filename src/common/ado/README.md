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
- `AdoWorkItemType` — `{ name, color, icon, states }` for one enabled work item type; `color` is
  ADO's hex string (no `#`), `icon` is the type glyph's URL, and `states` are the type's state names.
- `AdoMetadata` — `{ teams: AdoTeam[]; areaPaths: string[]; workItemTypes: AdoWorkItemType[] }`;
  `areaPaths` are user-facing strings such as `Project\Area\Team`.
- `EMPTY_ADO_METADATA` — the `{ teams: [], areaPaths: [], workItemTypes: [] }` fallback so callers
  never see `undefined`.

### `fetchAdoMetadata.ts`

- `buildAdoMetadataUrls(href)` — parses the org/project from the tab URL and returns the
  `{ teamsUrl, areaPathsUrl, workItemTypesUrl }` to fetch, or `null` for a non-project (org/folder)
  URL.
- `parseTeams(body)` — turns the raw teams REST body into a sorted `AdoTeam[]`; **best-effort** (a
  missing/malformed body yields `[]`).
- `flattenAreaPaths(root)` — flattens the raw classification tree into `Project\Area` strings.
- `parseWorkItemTypes(body)` — turns the raw work-item-types REST body into a sorted
  `AdoWorkItemType[]`, dropping disabled types; **best-effort** like `parseTeams`. The list endpoint
  returns each type's states inline, so one request covers types and their states.
- `adoCollectionBaseUrl` — the small pure helper the URLs share, exported for focused testing.
- `AdoMetadataUrls` — the `{ teamsUrl, areaPathsUrl, workItemTypesUrl }` shape `buildAdoMetadataUrls`
  returns.

## Usage guidance

- The **options-page reader** (`ChromeAdoMetadataReader` in `src/common/browser`) calls
  `buildAdoMetadataUrls`, injects `fetchAdoRawInPage` into the ADO tab to get the raw JSON, then
  applies `parseTeams` / `flattenAreaPaths` / `parseWorkItemTypes`. It is the only place that touches
  chrome APIs.
- Everything here is pure: tests pass URLs/bodies directly and never touch the network.
