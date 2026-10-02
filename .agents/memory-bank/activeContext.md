# Active Context

This file is the compact task-entry handoff. Detailed as-built behavior lives in `progress.md`,
architecture and ownership rules live in `systemPatterns.md`, fixed rationale lives in
`decisions.md`, and live-debugging findings live in `debuggingNotes.md`. Search those indexed files
for the feature being changed instead of loading them wholesale.

## Current state

AwesomeADO is feature-complete for its current scope:

- Per-query enhanced-view bindings sync through browser storage and support Sprint, Project Tracking,
  All Projects Catalog, Consumers, and the original ADO view.
- Consumers View (ADR-081) hides a tree query's grouping root and lists consumers with their feature
  requests. Binding `consumerAreaPaths` ("Consumer area paths", renamed from `requestAreaPaths` with
  no fallback) keeps consumers in each configured area branch and its descendants; the URL-synced
  header Area filter then narrows CONSUMERS by represented full path. Requests are never area
  filtered. Header `−` closes open descriptions, then discussions, then the deepest open tree level;
  `+` opens one tree level (`treeExpansion.ts`). Consumer rows omit
  Status editing while request rows retain it. A fixed-depth drag reorders consumers and
  reorders/moves requests with Project Tracking's backlog rank. Its header represents the hidden root
  with that item's title and theme-aware ADO type color. Every displayed item has the shared
  type-colored description control and lazy Discussion panel; right-click **View all notes** opens
  the complete discussion with the shared note editor.
  Each consumer is one grid-laid card row (`__row.is-consumer.__card`: twisty column, then the title
  line over the description-parsed identity and Contacts list, so the `?` and the details share a
  left edge); its description and Discussion panels open below the card. Contacts are assignee
  pills led by a red remove ×, with the role as the tag, editable in place and written back into the
  description. The description reader is deliberately loose (`descriptionText` / `descriptionSections`
  / `contactEntries`); only `own-line` contacts in Markdown are editable, and rich text shows a
  "has to be Markdown to be editable" tooltip. Scenario and details are parsed only.
  Tree boards share `renderViewHeader`, TreeRow, item-status, board-lifecycle
  (loader/write-status/write-queue), retained area filter, and `persistTreeMove`. Authenticated
  browser validation of the Consumers View remains pending.
- The content runtime is SPA-aware, route-gates heavy work, lazy-loads large view renderers, and uses
  background-to-MAIN-world bridges for credentialed Azure DevOps operations.
- Shared view controls, normalized ADO models, ordering, settings, bindings, navigation, logging, and
  browser adapters live under their owning `src/common/**` components.
- Shared work-item type display colors preserve ADO hues on light schemes and lift them toward the
  active foreground on dark schemes across every enhanced view.
- Every enhanced-view header wraps complete controls at narrow widths while keeping button and
  filter labels intact.
- Project Tracking assignee pills use primary text through the shared control's
  `--assigned-to-text-color` override; Unassigned and other views retain secondary text.
- Project Tracking keeps sprint selection enabled with filtering off and outlines matching sprint
  pills without narrowing the tree; SprintPicker disables selection only when no options exist.
- Enhanced views use injected services and one serialized work-item write queue. Every item-changing
  operation must leave the model's `System.Rev` current; see `systemPatterns.md` and ADR-030.
- Project Tracking create commands are level-named (`newChildOfferFor`): the work level is the last
  non-Primary-work planning type in config order (**New work identified**), its parent types offer
  **New deliverable**, every type above offers **New project**; the title offers **Add deliverable**
  (also the All Projects Catalog project-row label).
- Project Tracking verifies accepted backlog reorders against the requested sibling interval and
  directly corrects mixed-type or unranked levels when ADO's team endpoint did not place the item.
- Project Tracking accepts center-row drops into configured parents, even empty or collapsed ones,
  appending after their full child list and converting to the default child type in the same guarded
  parent-link write. Edge drops still reorder; hierarchy changes remain one-level and demotion leaf-only.
- Project Tracking renders a branch twisty only when at least one child row survives the active
  filters, so expanding a row never reveals an empty child container.
- Project Tracking prunes abandoned work at load through the state mapping
  (`pruneAbandonedWorkItems`: mapped to the last board column), so `Cut` hides like `Removed`;
  the generated project-query WIQL still pre-excludes the literal ADO `Removed` and `Cut` states.
- Project Tracking's session-scoped `Show only {fourth state}` toggle narrows the tree to the
  configured completed column through the shared ADO-state mapping, including work outside the
  normal resolved-age window, while preserving planning ancestors and composing with every other
  active filter.
- Sprint View clears Lane, Project, person, marker, and activity filters from one pills-row command;
  right-clicking its Unassigned person pill instead excludes unassigned work and draws a
  bottom-left-to-top-right diagonal in the selected outline color.
- Sprint View synchronizes its horizontally scrolled card grids without transformed ancestors, so
  card popups that escape a clipped lane remain correctly anchored to the viewport.
- Sprint parent cards show a Sub-items completed/total badge for primary descendants in the selected
  sprint, indexed from roster-eligible items before interactive filters. The popup labels hidden
  cards and scrolls to visible ones with an immediate theme-colored outline held for 2.4 seconds,
  then faded for 0.6 seconds; compact Done cards retain it.
  Shared child badges now expose
  completed/total tooltips. Authenticated visual validation of the new badge remains pending.
- Options manages appearance, Azure DevOps configuration, query bindings, file transfer, team
  configuration sharing, shared queries, and device-local diagnostics.
- Configuration Sharing has an Advanced query picker backed by the ordinary shared
  `settings.configurationQueryId` field. Selecting another candidate disconnects, reconnects, and
  pulls through the synced source; open query/options pages follow source changes and discard stale
  pulls. Full file export/import remains; connection-only export UI is removed.
  Advanced uses a five-column table capped at ten visible rows, defaults to the connected item even
  when absent from results, orders rows by newest modification first, and separates modification
  date/time from the last editor. The connected row has a highlighted Active marker and bold name;
  muted Not active markers switch the source. A full-width busy row replaces candidate rows while the
  configuration query is loading, including the initial wait for Azure DevOps reachability after
  the saved query setting arrives.
- Catalog Favorites traverses every tag-filtered hierarchy level in display order, including
  collapsed branches, skips unlinked items, and appends the exact current catalog URL. Linked rows
  offer Clear project query; the removal service deletes before unlinking and retains links on
  deletion failure. Clear-query progress/errors remain visible; hyperlink matching ignores trailing
  slashes and casing while the unlink guard uses the exact stored URL.
- All Projects Catalog syncs filtered project query links and a final filtered-catalog link into a
  personal Favorites destination below the browser bar. The binding editor warns that sync replaces
  the folder's favorites, never stores the bar root or malformed paths, and stays disabled (a saved
  folder read-only) until its **Allow Favorites access** button obtains the optional `bookmarks`
  permission, then autocompletes folders;
  `settings.queryFavoritesPaths` follows native browser sync and full file export/import,
  never ADO publishing, pulls, or shared-query overlays. Sync replaces only the folder's direct links
  and never touches subfolders. The title command is always shown, disabled with the worker status
  refusal (or checking/queries-unknown) as its tooltip. The post-sync popup lists removed favorites
  for selective restore from a worker-held `chrome.storage.session` record (popup-only undo,
  ADR-082). Authenticated validation of the permission prompt and restore flow is pending.
- User-visible decisions and failures are source-tagged in the bounded diagnostics log; every caught
  runtime exception is logged with its original value.
- The complete quality gate remains coverage ≥ 85%, zero lint warnings, formatting, typecheck,
  duplication, script tests, and workflow validation.

## Development workflow

- Read `README.md`, `projectbrief.md`, and this file at task start. Then search only the relevant
  sections of the other memory files.
- Use focused checks while implementation or user feedback is active. Apply worker memory/changelog
  deltas once, then run one final `pnpm verify` for the stable repository state.
- Pure Vitest suites run under Node and DOM suites under jsdom. Static gate stages run concurrently;
  Prettier, ESLint, and TypeScript use ignored local caches.
- `pre-push` runs `pnpm verify:reuse`, which accepts a prior result only for identical repository
  contents and the same Node/pnpm runtime. CI always runs a fresh gate. See ADR-080.
- For repeated browser UI work, keep build watch and the existing CDP browser alive and reload in
  place. Compact or start a fresh chat with a concise handoff after a long feedback loop.

## Architecture anchors

- Composition roots: `src/background/index.ts`, `src/content/index.ts`, `src/options/index.ts`.
- Runtime browser APIs: `src/common/browser/**` only.
- Shared ADO data and REST contracts: `src/common/ado/**`.
- Shared themed DOM controls: `src/common/view-common/control/**`; no other DOM belongs in common.
- Concrete enhanced views: `src/content/views/**`; options may import only `views/viewCatalog`.
- Synced configuration: `src/common/settings/**`, `src/common/bindings/**`, and
  `src/common/settings-transfer/**`.
- Source-tagged diagnostics: `src/common/logging/**`.

## Pending developer-owned work

- Authenticated browser validation in Edge and Chrome for Testing.
- Initial marketplace listings and remaining promotional images.
- Repository release-trust configuration and store credentials for the first official release.
