# `content/views/project-tracking`

The **Project Tracking View**: presents a bound query's items as a hierarchical tree board with
sprint filtering, expand/collapse controls, and per-item description toggles. This folder holds both
halves of the view — its configuration and its renderer.

## Public API

- `projectTrackingViewType.ts` → `projectTrackingViewType: ViewType` — the view's config. Id
  `"projectTracking"`, label `"Project Tracking"`, with these per-query properties:
  - `orderingPolicy` (select) — how items are ordered within each group; choices and the default
    come from [`common/ordering`](../../../common/ordering), which also resolves the raw sort key.
  - `weeks` (number) — how far back per-item Updates reach.
  - `days` (number) — hide resolved items once resolved more than this many days ago.
  - `hours` (number) — rolling window behind the "newly created / updated / new notes" pills.
- `ProjectTrackingView.ts` → `projectTrackingView: EnhancedView` — the renderer. Renders a live
  tree board with the following features:
  - **Single-root requirement**: the query must return exactly one root item of the first configured
    work item type (typically Epic). Shows validation messages for non-tree queries, empty queries,
    multiple roots, or wrong root type.
  - **Header panel**: rendered by the view-specific
    [`header`](./header/README.md) control — a themed tile (subtle background, card-like) with three
    bands:
    1. Breadcrumbs: the query's clickable parent-folder trail (hidden until a folder-path source is
       wired).
    2. Write-queue status: a right-aligned row above the sprint picker showing the shared
       [`WriteQueueStatus`](../../../common/view-common/control/WriteQueueStatus/README.md)
       indicator, driven live by the board's `FieldWriteQueue`. It stays hidden until a field write
       is in flight, then shows an animated "Saving N change(s)…" spinner and disappears once the
       queue drains.
    3. Title + controls: the root item's title (colored by type) with the expand-all/collapse-all
       (`+`/`−`) buttons beside it and the sprint picker pinned to the right edge of the same band.
    4. Tech Lead + ETA: "TechLead:" label + root's Assigned To, followed by the root's editable ETA
       badge (click to pick a date or clear it, when the root type has an ETA field configured).
  - **Sprint filter**: uses the reusable `SprintPicker` control, populated from the shared sprint
    window (`services.loadSprintWindow()` → the configured team's iterations around the current one,
    each labelled by its offset such as `Current - Sprint 5` or `2 sprints ago`). Filter ON by
    default when sprints exist and pre-selected on the current sprint (rows filtered to selected
    sprint + ancestor paths, pills hidden); OFF shows all rows with sprint pills. Empty sprints →
    forced OFF, toggle disabled.
  - **Tree rows**: the tree renders only **two levels below the root** — the root's children and
    their children. Each row shows twisty (when it has child rows), editable Status badge, title
    (type-colored), description toggle ("?" button), Assigned To control (with the assignee's Feature
    Crew **tag pill**), sprint pill (when filter
    OFF — shown only for items on a real, leaf iteration; an item parked on the iteration root shows
    no pill), and ETA badge (right-aligned; editable — click to pick a date or clear it when the
    item's type has an ETA field configured). Clicking the twisty expands/collapses that node's children.
    The Status badge uses [`renderStatusBadge`](../../../common/view-common/control/StatusBadge/README.md)
    and displays the **Status** (the board-column label the item's ADO State maps to), never the raw
    ADO State. Choosing a new Status optimistically updates the row and enqueues a serialized write of
    that column's primary ADO State via
    [`FieldWriteQueue`](../../../common/ado/FieldWriteQueue/README.md) (one queue per board, shared
    with ETA edits, so writes never race on `System.Rev`).
  - **Rolled-up minor children**: the level below the last rendered row is summarized inline by
    [`ChildItemsBadge`](../../../common/view-common/control/ChildItemsBadge/README.md) — a
    "completed / total" chip (e.g. `1 / 3`) tinted with a discrete wash of the **last configured work
    item type's** color. "Completed" is the last board column _before_ Removed (Done), so an
    abandoned child never counts as finished. The rollup honors the active sprint and tag filters, so
    it always agrees with what the board claims to be showing, and a deepest row therefore has no
    twisty (there is no branch to expand). Clicking the chip opens a popup with one row per child:
    `{Assigned To} {title in its type color} {ETA} {type icon → opens the item in ADO}`. Both the
    assignee picker and the ETA behave exactly as they do in a tree row — the ETA is built with the
    same helper, so edits persist through the board's shared write queue.
  - **Indentation**: 70% less than before (~7px vs 24px) with a discrete themed vertical guide line
    showing parent-child relationships (low-alpha neutral border).
  - **Description panel**: toggles below each row; displays "Created on: <date>, Last Modified on:
    <date>" followed by the item's description text. Uses
    [`renderItemLifecycleInfo`](../../../common/view-common/control/ItemLifecycleInfo/README.md),
    which shows each actor's name in a "By <name>" tooltip and renders dates with
    [`DateLabel`](../../../common/view-common/control/DateLabel/README.md) (never innerHTML).
  - **Theme compliance**: EVERY control (badges, pills, buttons, twisties, the header panel, the
    guide line) follows the ADO theme via CSS custom properties with literal fallbacks, never
    hard-coded light-only colors as the sole value (ADR-034, principle #13).
  - **Feature Crew reconcile**: on load the view collects everyone assigned across the tree and asks
    `services.featureCrew` to reconcile the project's Feature Crew roster (see
    [`common/ado/FeatureCrew`](../../../common/ado) and
    [`common/browser`](../../../common/browser)); it also re-reconciles immediately when someone is
    picked inline via an Assigned To control, so a newly-added person joins the roster without a
    reload. The write is fire-and-forget — a failure is logged but never blocks the board — and is
    skipped when no work item types are configured. When the reconcile resolves it hands back the
    roster's tags, which the board projects onto every assignee (`applyFeatureCrewTags`) so each
    Assigned To pill shows its color.
  - **Tag filter panel**: once the roster resolves, a [`tag-filter`](./tag-filter/README.md) panel of
    clickable tag pills appears above the tree. Clicking pills narrows the tree to items assigned to
    people wearing any of the selected tags (an **OR** across the selection; empty = show everyone),
    combined with the sprint filter. The neutral **"??"** pill narrows to assigned-but-untagged
    people. Ancestors of a matching item stay visible so a match is never orphaned from its path.

Because every property is stored on the binding, the same view bound to two queries can use
different windows. Both halves are registered centrally: the config in `../viewCatalog.ts`, the
renderer in `../enhancedViewRegistry.ts`.
