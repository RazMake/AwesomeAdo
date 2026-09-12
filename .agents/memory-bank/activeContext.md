# Active Context

This file is the compact task-entry handoff. Detailed as-built behavior lives in `progress.md`,
architecture and ownership rules live in `systemPatterns.md`, fixed rationale lives in
`decisions.md`, and live-debugging findings live in `debuggingNotes.md`. Search those indexed files
for the feature being changed instead of loading them wholesale.

## Current state

AwesomeADO is feature-complete for its current scope:

- Per-query enhanced-view bindings sync through browser storage and support Sprint, Project Tracking,
  All Projects Catalog, and the original ADO view.
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
- Project Tracking verifies accepted backlog reorders against the requested sibling interval and
  directly corrects mixed-type or unranked levels when ADO's team endpoint did not place the item.
- Project Tracking accepts center-row drops into configured parents, even empty or collapsed ones,
  appending after their full child list and converting to the default child type in the same guarded
  parent-link write. Edge drops still reorder; hierarchy changes remain one-level and demotion leaf-only.
- Project Tracking renders a branch twisty only when at least one child row survives the active
  filters, so expanding a row never reveals an empty child container.
- Project Tracking's session-scoped `Show only {fourth state}` toggle narrows the tree to the
  configured completed column through the shared ADO-state mapping, including work outside the
  normal resolved-age window, while preserving planning ancestors and composing with every other
  active filter.
- Sprint View clears Lane, Project, person, marker, and activity filters from one pills-row command;
  right-clicking its Unassigned person pill instead excludes unassigned work and draws a
  bottom-left-to-top-right diagonal in the selected outline color.
- Options manages appearance, Azure DevOps configuration, query bindings, file transfer, team
  configuration sharing, shared queries, and device-local diagnostics.
- Catalog Favorites traverses every tag-filtered hierarchy level in display order, including
  collapsed branches, skips unlinked items, and appends the exact current catalog URL. Linked rows
  offer Clear project query; the removal service deletes before unlinking and retains links on
  deletion failure. Clear-query progress/errors remain visible; hyperlink matching ignores trailing
  slashes and casing while the unlink guard uses the exact stored URL.
- All Projects Catalog syncs filtered project query links and a final filtered-catalog link into a
  personal Favorites destination below the browser bar. The binding editor autocompletes folders;
  `settings.queryFavoritesPaths` follows native browser sync and full file export/import, never ADO
  publishing, pulls, or shared-query overlays. Sync replaces destination contents, including folders.
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
