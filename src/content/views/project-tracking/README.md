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
    2. Title + controls: the root item's title (colored by type) with the expand-all/collapse-all
       (`+`/`−`) buttons beside it and the sprint picker pinned to the right edge of the same band.
    3. Tech Lead + ETA: "TechLead:" label + root's Assigned To, followed by the root's ETA badge.
  - **Sprint filter**: uses the reusable `SprintPicker` control. Filter ON by default when sprints
    exist (rows filtered to selected sprint + ancestor paths, pills hidden); OFF shows all rows with
    sprint pills. Empty sprints → forced OFF, toggle disabled.
  - **Tree rows**: each row shows twisty (when children exist), editable Status badge, title
    (type-colored), description toggle ("?" button), Assigned To control, sprint pill (when filter
    OFF), and ETA badge (right-aligned). Clicking the twisty expands/collapses that node's children.
    The Status badge uses [`renderStatusBadge`](../../../common/view-common/control/StatusBadge/README.md)
    and displays the **Status** (the board-column label the item's ADO State maps to), never the raw
    ADO State. Choosing a new Status optimistically updates the row and enqueues a serialized write of
    that column's primary ADO State via
    [`StateWriteQueue`](../../../common/ado/StateWriteQueue/README.md) (one queue per board, so writes
    never race on `System.Rev`).
  - **Indentation**: 70% less than before (~7px vs 24px) with a discrete themed vertical guide line
    showing parent-child relationships (low-alpha neutral border).
  - **Description panel**: toggles below each row; displays "Created: <date> (by <name>), Last
    Modified: <date> (by <name>)" followed by the item's description text. Uses
    [`renderDateLabel`](../../../common/view-common/control/DateLabel/README.md) for dates and `textContent` for names (never
    innerHTML).
  - **Theme compliance**: EVERY control (badges, pills, buttons, twisties, the header panel, the
    guide line) follows the ADO theme via CSS custom properties with literal fallbacks, never
    hard-coded light-only colors as the sole value (ADR-034, principle #13).
  - **Feature Crew reconcile**: on load the view collects everyone assigned across the tree and asks
    `services.featureCrew` to reconcile the project's Feature Crew roster (see
    [`common/ado/FeatureCrew`](../../../common/ado) and
    [`common/browser`](../../../common/browser)); it also re-reconciles immediately when someone is
    picked inline via an Assigned To control, so a newly-added person joins the roster without a
    reload. The write is fire-and-forget — a failure is logged but never blocks the board — and is
    skipped when no work item types are configured.

Because every property is stored on the binding, the same view bound to two queries can use
different windows. Both halves are registered centrally: the config in `../viewCatalog.ts`, the
renderer in `../enhancedViewRegistry.ts`.
