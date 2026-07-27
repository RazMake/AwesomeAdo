# `content/views/project-tracking`

The **Project Tracking View**: presents a bound query's items as a hierarchical tree board with
sprint filtering, expand/collapse controls, and per-item description toggles. This folder holds both
halves of the view — its configuration and its renderer.

## Public API

- `projectTrackingViewType.ts` → the view's config plus the readers the renderer resolves it with.
  `projectTrackingViewType: ViewType` has id `"projectTracking"`, label `"Project Tracking"`, and
  these per-query properties:
  - `orderingPolicy` (select) — how items are ordered within each group; choices and the default
    come from [`common/ordering`](../../../common/ordering), which also resolves the raw sort key.
  - `weeks` (number) — how far back per-item Updates reach.
  - `days` (number) — hide resolved items once resolved more than this many days ago.
  - `hours` (number) — rolling window behind the "newly created / updated / new notes" pills.

  `orderingPolicyOf(properties)` and `hideResolvedAfterDays(properties)` turn a binding's stored
  strings into the typed values the renderer uses — defaulted, clamped, and validated against the
  offered choices. Use them instead of reading `properties["…"]` directly, so a key or a default can
  never drift between the binding form and the board.

- `ProjectTrackingView.ts` → `projectTrackingView: EnhancedView` — the renderer. Renders a live
  tree board with the following features:
  - **Single-root requirement**: the query must return exactly one root item of the first configured
    work item type (typically Epic). Shows validation messages for non-tree queries, empty queries,
    multiple roots, or wrong root type.
  - **Header panel**: rendered by the view-specific
    [`header`](./header/README.md) control — a themed tile (subtle background, card-like) with three
    bands:
    1. Breadcrumbs + ordering: the query's clickable parent-folder trail on the left, and the
       discrete [`OrderingPicker`](../../../common/view-common/control/OrderingPicker/README.md)
       glyph pinned to the tile's top-right corner.
    2. Write-queue status: the shared
       [`WriteQueueStatus`](../../../common/view-common/control/WriteQueueStatus/README.md)
       indicator shares the top-right corner with the ordering glyph, sitting just to its left and
       driven live by the board's `WorkItemWriteQueue`. It stays hidden until a field write or a move
       is in flight, then shows an animated "Saving N change(s)…" spinner and disappears once the
       queue drains; a rejected write turns it into a filled red alert chip that can be clicked away.
       That band's height is **reserved**, so the indicator appearing and disappearing never resizes
       the sticky header — which would otherwise shove the whole board down and back on every edit.
    3. Title + controls: the root item's title (colored by type) with the expand-all/collapse-all
       (`+`/`−`) buttons beside it and the sprint picker pinned to the right edge of the same band.
    4. Tech Lead + ETA: "TechLead:" label + root's Assigned To, followed by the root's editable ETA
       badge (click to pick a date or clear it, when the root type has an ETA field configured).
  - **Item ordering**: every level of the tree (and the rolled-up children popup) is sorted by the
    binding's `orderingPolicy` through [`common/ordering`](../../../common/ordering) — the board
    never compares items itself. `importance` uses ADO's manual backlog rank (lowest first; an item
    ADO gave no rank falls to the bottom), `title` is a–z, `eta` is earliest first with undated items
    last.
  - **Ordering picker**: the header's sort glyph names the policy in force in its tooltip and opens
    the same list of policies the binding form offers. Picking one re-sorts every level of the tree
    (and the rolled-up children popup) **immediately**, from the items already loaded — no ADO read.
    The pick lasts for the life of the board only; it is deliberately not written back to the
    binding, because a synced write would rebuild the whole board to show items nobody re-fetched.
    The binding's `orderingPolicy` remains the order every board opens on. The glyph doubles as the
    drag-reorder status light: it turns a heavily-transparent red whenever dragging is unavailable,
    and its tooltip says why.
  - **Drag to reorder**: while the board is ordered **by importance**, a row's title is a drag handle
    (the pointer shows `grab` over it and nowhere else). Dragging shows a themed insertion line where
    the row would land; dropping it under a different parent also washes that parent's children
    container so the re-parent is visible before the mouse is released. Dropping persists the move
    through the shared write queue: the item is re-ranked with ADO's **own** backlog-order endpoint
    (which owns the rank arithmetic) and, when the parent changed, its `System.Parent` link is
    re-pointed first under a `/rev` test so a concurrent edit is rejected rather than overwritten.
    See [`drag-reorder`](./drag-reorder/README.md).
    - A row can only land at its **own level**: an item never becomes a child of a row it was a peer
      of, so a parent is only ever reordered among its own siblings while a leaf may move to any
      parent at its depth.
    - Rank is computed against the level's **full** sibling list, so a move made while the sprint or
      tag filter hides rows still lands where the user aimed once the filter comes off.
    - Persist-then-reflect like every other control here: the row does not move until ADO accepts it,
      the "Saving…" indicator covers the gap, and a rejected move is reported there rather than
      leaving the board showing a position nobody saved.
    - Unavailable under any other ordering policy (a dropped row would be re-sorted straight back
      out of its slot) and when no team is configured (backlog rank is per-team in ADO, so there is
      no backlog to rank against).
  - **Resolved-item window**: an item whose Status maps to the board column _before_ Removed (the
    resolved/Done column) drops off the board once its **state** last changed more than `days` days
    ago — so re-reading or re-tagging finished work does not bring it back. It stays visible while an
    unresolved item still sits beneath it, and an item ADO returned no state-change date for is never
    aged out. The rollup badge applies the same rule, so a hidden child is not still counted there.
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
    Rows open expanded, and a row you collapse **stays** collapsed across every repaint — a
    drag-reorder, a re-sort, a sprint or tag filter change — because each pass builds new elements
    and the closed rows are remembered by work item id outside the DOM.
    The Status badge uses [`renderStatusBadge`](../../../common/view-common/control/StatusBadge/README.md)
    and displays the **Status** (the board-column label the item's ADO State maps to), never the raw
    ADO State. Choosing a new Status optimistically updates the row and enqueues a serialized write of
    that column's primary ADO State via
    [`WorkItemWriteQueue`](../../../common/ado/WorkItemWriteQueue/README.md) (one queue per board, shared
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
