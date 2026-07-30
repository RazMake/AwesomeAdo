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
  - `weeks` (number) — how far back per-item Updates (notes) reach.
  - `days` (number) — hide resolved items once resolved more than this many days ago.
  - `hours` (number) — rolling window behind the "newly created / updated / new notes" pills.

  `orderingPolicyOf(properties)`, `hideResolvedAfterDays(properties)`, `updatesWindowWeeks(properties)`
  and `recentChangesWindowHours(properties)` turn a binding's stored strings into the typed values the
  renderer uses — defaulted, clamped, and validated against the offered choices. Use them instead of
  reading `properties["…"]` directly, so a key or a default can never drift between the binding form
  and the board.

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
       (`+`/`−`) buttons beside it, the refresh (`⟳`) button spaced apart from that pair, and the
       sprint picker pinned to the right edge of the same band. `+` opens all parent rows before a
       later click opens every visible item's notes. `−` closes open notes and descriptions before a
       later click collapses the parent rows.
    4. Tech Lead + ETA: "TechLead:" label + root's Assigned To, followed by the root's editable ETA
       badge (click to pick a date or clear it, when the root type has an ETA field configured).
  - **Refresh**: `⟳` re-reads the whole board — the tree and the sprint window — from Azure DevOps
    and repaints in place. It never reloads the page, and it does **not** touch ADO's own (hidden)
    query grid: the two run in different JS worlds and share no state, so ADO's grid stays as stale
    as it was (see ADR-029). What a refresh does:
    - **Waits for queued writes first.** A read that overtakes an in-flight write is answered with
      the value the user just replaced, which would paint their edit as though it had been lost.
    - **Keeps the reader's place**: the outline they collapsed, the discussions they opened, the tag
      and sprint filters, this session's ordering pick, and the scroll position all survive. An
      **untouched** sprint picker re-seeds from the freshly loaded window instead, so a board left
      open across a sprint boundary follows the new current sprint.
    - **Keeps the board on failure.** A failed re-read is recorded in the log and reported on the
      button itself (which turns red and says the board is showing older data) rather than replacing
      a truthful-if-older board with "Could not load this query.". Pressing the button in that state
      opens the Diagnostics log on the cause and clears the report; the press after that refreshes
      again.
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
  - **Drag to reorder**: while the board is ordered **by importance**, a tree row's title and each
    rolled-up child's popup title are drag handles (the pointer shows `grab` over them and nowhere
    else). Dragging shows a themed insertion line where the item would land; dropping a tree row
    under a different parent uses a different themed insertion color and washes that parent's children
    container so the re-parent is visible before the mouse is released. Dropping persists the move
    through the shared write queue: the item is re-ranked with ADO's **own** backlog-order endpoint
    (which owns the rank arithmetic) and, when the parent changed, its `System.Parent` link is
    re-pointed under a `/rev` test. The item is converted to the destination parent's configured
    default child type in that same JSON Patch, so the parent and type either both land or neither
    does.
    See [`drag-reorder`](./drag-reorder/README.md).
    - A row may stay at its level or move one level: dragging a child between its parent's peers
      promotes it under their parent, while dragging a leaf among another item's children demotes it
      at the exact position targeted. A parent that still has children cannot be demoted.
    - Dragging a rolled-up child outside its popup closes the popup and continues the same hierarchy
      move against the tree.
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
    hidden. A completed item's ETA is green when that state change happened on or before the ETA's
    Pacific calendar day; a late or undated completion uses the same neutral color as "No ETA".
    aged out. The rollup badge applies the same rule, so a hidden child is not still counted there.
  - **Sprint filter**: uses the reusable `SprintPicker` control, populated from the shared sprint
    window (`services.loadSprintWindow()` → the configured team's iterations around the current one,
    each labelled by its offset such as `Current - Sprint 5` or `2 sprints ago`). Filter ON by
    default when sprints exist and pre-selected on the current sprint (rows filtered to selected
    sprint + ancestor paths, pills hidden); OFF shows all rows with sprint pills. Empty sprints →
    forced OFF, toggle disabled.
  - **Tree rows**: the tree renders only **two levels below the root** — the root's children and
    their children. Each row shows twisty (when it has child rows), editable Status badge, editable
    Priority chip immediately after it, description toggle ("?" button), type icon (the notes toggle), title
    (type-colored), Assigned To control (with the assignee's Feature
    Crew **tag pill**), an amber **Blocked (internal)** pill and/or red **Blocked by another team**
    pill when the item carries those configured tags (click one to read the notes that say why — see
    [`marker-reasons`](./marker-reasons/README.md)), sprint pill (when filter
    OFF — shown only for items on a real, leaf iteration; an item parked on the iteration root shows
    no pill; click it to move the item to another current or future sprint, with the item's present
    sprint omitted and each destination highlighted on hover or focus), and ETA badge (right-aligned;
    editable — click to pick a date or clear it when the item's type has an ETA field configured).
    Clicking the twisty expands/collapses that node's children.
    Visible rows use subtle alternating backgrounds from the resolved AwesomeADO theme. The board
    reassigns the sequence in depth-first reading order whenever a branch opens or closes, so nested
    rows never break the alternation. Hovering a row applies a stronger themed wash; holding
    `Ctrl+Shift` while hovering strengthens it again for deliberate visual tracking and extends that
    emphasis through the item's open notes and description panels.
    Rows open expanded, and a row you collapse **stays** collapsed across every repaint — a
    drag-reorder, a re-sort, a sprint or tag filter change — because each pass builds new elements
    and the closed rows are remembered by work item id outside the DOM.
    The Status badge uses [`renderStatusBadge`](../../../common/view-common/control/StatusBadge/README.md)
    and displays the **Status** (the board-column label the item's ADO State maps to), never the raw
    ADO State. Choosing a new Status optimistically updates the row and enqueues a serialized write of
    that column's primary ADO State via
    [`WorkItemWriteQueue`](../../../common/ado/WorkItemWriteQueue/README.md) (one queue per board, shared
    with ETA edits, so writes never race on `System.Rev`).
    The Priority chip uses
    [`renderPriorityBadge`](../../../common/view-common/control/PriorityBadge/README.md): every
    priority has the same gray background (darker with a darker edge on dark themes), while P0 has
    unmixed red text, P1 has unmixed orange text, and P2 uses a restrained gray on every theme. Those three are
    extra-bold; P3 and later use muted secondary text at normal weight. The compact label sits close
    to Status. Clicking it opens P0-P4 as identically formatted chips, omits the current value, and writes the selected
    `Microsoft.VSTS.Common.Priority` through the same serialized queue.
  - **Rolled-up minor children**: the level below the last rendered row is summarized inline by
    [`ChildItemsBadge`](../../../common/view-common/control/ChildItemsBadge/README.md) — a
    "completed / total" chip (e.g. `1 / 3`) tinted with a discrete wash of the **last configured work
    item type's** color. "Completed" is the last board column _before_ Removed (Done), so an
    abandoned child never counts as finished. The rollup honors the active sprint and tag filters, so
    it always agrees with what the board claims to be showing, and a deepest row therefore has no
    twisty (there is no branch to expand). Clicking the chip opens a popup with one row per child:
    `{done checkbox} {Assigned To + Feature Crew tag pill} {title in its type color}{open-in-ADO glyph} {ETA}`.
    The assignee carries (and can edit) the crew tag pill just like a tree row, because a rolled-up
    child is the only place its assignee is shown. The popup
    widens to fit its longest title so the list reads one child per line wherever the viewport
    allows. The checkbox is ticked (and the title struck through) for a child already on the
    completed column; clicking it moves the child to the completed column, or — for a child already
    there — back onto the **in-progress** column (board position 1). All three controls behave
    exactly as they do in a tree row: they persist through the board's shared write queue and only
    reflect what it commits. While ordered by importance, the title is also a drag handle for
    reordering these children; the tree's themed insertion line previews the landing between popup
    rows. After Azure DevOps accepts a reorder, the popup stays open on the newly ordered rows so
    another child can be moved immediately. A type that routes no state onto the target column leaves
    the tick where it was and says so in the diagnostics log.
  - **Indentation**: 70% less than before (~7px vs 24px) with a discrete themed vertical guide line
    showing parent-child relationships (low-alpha neutral border).
  - **Description panel**: toggles below each row; displays "Created on: <date>, Last Modified on:
    <date>" followed by the item's description. Uses
    [`renderItemLifecycleInfo`](../../../common/view-common/control/ItemLifecycleInfo/README.md),
    which shows each actor's name in a "By <name>" tooltip and renders dates with
    [`DateLabel`](../../../common/view-common/control/DateLabel/README.md) (never innerHTML). The
    description itself renders through
    [`MarkdownText`](../../../common/view-common/control/MarkdownText/README.md), so Markdown, ADO
    rich text, embedded attachment images and `@`-mentions all show as they do in ADO. The **"?"
    disc** that toggles it follows the type icon's emphasis. On light and blue themes it uses an
    almost-white tint of the item's **type color**, strengthening that tint while open; on dark themes
    the same two states retain the deeper type-color treatment. An item with **no** description stays
    neutral in both states. The glyph switches between dark and light ink with the scheme and is
    flex-centered in the fixed circle. The disc's `title` names only the
    ACTION ("Show description" / "Hide description"), never whether there is one: the panel still
    carries the created/modified line either way, so the disc is worth pressing on every row and a
    "nothing here" label would talk the reader out of it. The shade answers that question instead.
  - **Type icon + notes**: each row's title is preceded by its work item type icon
    ([`ItemTypeIcon`](../../../common/view-common/control/ItemTypeIcon/README.md)), sized to the
    title and tinted by ADO in the type's own color. The icon **is** the item's notes toggle, and its
    emphasis is read on two axes so the board can be read without clicking anything: it keeps the
    type's **color** only when the item HAS a discussion, and comes to **full strength** only while
    the panel is open. An item with no discussion therefore stays **grey** even while it is open —
    opening it only brings the same grey forward, because the type color is the "there is something
    to read here" signal and an empty item has nothing to spend it on. The grey state is seeded from
    the item's `System.CommentCount` (which arrives
    with the tree, so it costs nothing) and corrected once a panel has actually read its window — a
    total counts comments the window excludes, so an item can start out promising notes and settle to
    grey. A failed read never greys an icon: the count is then unknown, not zero. Opening the icon
    reveals the [`notes`](./notes/README.md) panel — a "+ Add note" link above a newest-first list of
    the item's ADO Discussion. See that folder for the fetch-on-first-open behaviour, the Updates
    window, the two-day rule, and who may edit what.
  - **Theme compliance**: EVERY control (badges, pills, buttons, twisties, the header panel, the
    guide line) follows the pinned AwesomeADO theme via CSS custom properties without literal color
    fallbacks. Work-item type colors remain runtime data supplied by ADO; formulas derived from them
    blend toward the theme's background role (ADR-034, principle #13).
  - **Feature Crew reconcile**: on load the view collects everyone assigned across the tree and asks
    `services.featureCrew` to reconcile the project's Feature Crew roster (see
    [`common/ado/FeatureCrew`](../../../common/ado) and
    [`common/browser`](../../../common/browser)); it also re-reconciles immediately when someone is
    picked inline via an Assigned To control, so a newly-added person joins the roster without a
    reload. The write is fire-and-forget — a failure is logged but never blocks the board — and is
    skipped when no work item types are configured. When the reconcile resolves it hands back the
    roster's tags, which the board projects onto every assignee (`applyFeatureCrewTags`) so each
    Assigned To pill shows its color.
  - **Filter row**: one wrapping row sits between the header and the tree, introduced by a single
    **`Filters:`** label (vertically centred against the pills it shares a line with). It holds the
    [`tag-filter`](./tag-filter/README.md) pills first, then the
    [`activity-filter`](./activity-filter/README.md) pills, then the
    [`marker-filter`](./marker-filter/README.md) pills that close it; every pill is a direct
    child of that one flex row, so a narrow window reflows them all as a single continuous line. The
    board re-renders the row whole on any change.
    - **Tag pills**: once the Feature Crew roster resolves, one clickable pill per tag worn across
      the tree. Clicking pills narrows to items assigned to people wearing any of the selected tags
      (an **OR** across the selection; empty = show everyone), combined with the sprint filter. The
      neutral **"??"** pill narrows to assigned-but-untagged people. Ancestors of a matching item
      stay visible so a match is never orphaned from its path.
    - **Recent-activity pills**: three slightly larger pills — **Newly created**, **Newly updated**
      and **New notes** — each narrowing the board to items that moved inside the binding's `hours`
      window (named in each pill's tooltip). Lit pills **OR** together and combine with the sprint
      and tag filters; the window is re-measured on every repaint. "New notes" is the only one whose
      answer is not already in the loaded tree (ADO reports a comment TOTAL, never a comment date),
      so lighting it reads the discussions of the items ADO says have one — on demand, bounded, and
      at most once per board. Until those reads land the pill reads `New notes…` and the board stays
      wide, so it narrows once rather than emptying and repopulating.
    - **Marker pills**: one pill per recognized condition (**Blocked (internal)**, **Blocked by
      another team**, **Interrupt**) that something in the tree is actually tagged with, using the
      team's own tags from _Options → Azure DevOps → Marker tags_. A pill appears the moment any item
      carries its tag and goes away with the last one. Lit pills **OR** together and the group
      **AND**s with the tag and activity groups, exactly like the other two.
  - **Flagging an item**: the right-click menu's last group (`item-commands/MarkerCommands`) applies
    or clears those same markers. Applying one asks for a **mandatory** reason and writes the tag and
    that reason (prefixed with the team's configured token) as **one** JSON Patch — a separately
    posted comment would advance `System.Rev` and get the tag patch rejected with HTTP 412. Clearing
    asks for nothing. See [`item-commands`](./item-commands/README.md).

Because every property is stored on the binding, the same view bound to two queries can use
different windows. Both halves are registered centrally: the config in `../viewCatalog.ts`, the
renderer in `../enhancedViewRegistry.ts`.
