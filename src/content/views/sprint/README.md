# `content/views/sprint`

The **Sprint View** presents a bound query's work as a sprint-filtered lane table. It accepts flat and
tree queries. Manual refresh reloads the selected sprint's shared Lane filter while retaining the
other filters; selecting another sprint destroys the whole session and loads that sprint's shared
Lane selection.

## Public API

- `sprintViewType.ts` -> `sprintViewType: ViewType` - id `"sprint"`, label `"Sprint View"`, and the
  per-query ordering policy, recent-activity window in hours, and default Lane area paths.
- `SprintView.ts` -> `sprintView: EnhancedView` - loads the original WIQL and configured team's
  members before executing the sprint-adjusted query; renders the sprint, Lane, Project, refresh, write-queue, team,
  marker, and recent-activity controls; and shows the filtered card table.
- `SprintBoard.ts` -> `renderSprintBoard` - groups cards by exact area-path lane and the first four
  configured application-state columns (Queue through Done), keeps their horizontally synchronized
  titles and per-column Primary work counts sticky below the control header, keeps each lane's name
  and item count visible until the next lane pushes it away, and persists card and direct-child
  drag-and-drop moves. When no card would be drawn it renders the shared
  [`EmptyState`](../../../common/view-common/control/EmptyState/README.md) panel instead of an empty
  lane table, so a fully filtered board never reads as a failed load.
- `SprintHeader.ts` -> `renderSprintHeader` - assembles the sticky, theme-aware control card with
  the query's clickable parent-folder breadcrumb trail at the top.
- `SprintBulkMoveDialog.ts` -> `buildSprintBulkMovePlan` / `renderSprintBulkMoveDialog` - snapshots
  eligible visible cards and confirms their Lane/assignee summary before any write begins.
- `SprintBulkMoveController.ts` -> `SprintBulkMoveController` - owns confirmation, progress,
  cancellation, interaction/unload guards, and the final refresh.
- `SprintBulkMove.ts` -> `runSprintBulkMove` - revalidates only confirmed IDs and executes their
  bounded, retrying, atomically guarded iteration writes.

Right-clicking the **Sprint View** title always offers **Copy ADO Url** and **Reset lanes to
default**. Reset replaces the selected sprint's saved team-shared Lane paths with the query binding's
defaults and repaints; it is disabled when no defaults are configured. Only a selected **past** sprint
also offers **Move all (non DONE) items to**, with the current and future iterations as destinations.
The title uses a context-menu cursor without a tooltip, and DONE is rendered as a theme-aware green
chip in the command label.

Choosing a destination opens a confirmation dialog for the exact card set visible under the current
Lane, Project, person, marker, and activity filters. It summarizes eligible cards by Lane and by
assignee. Lane names use the filter dropdown's shortest unique suffixes: normally the leaf alone,
expanding through parents only until colliding leaves differ. Only assigned, non-Done Primary-work cards enter the immutable operation snapshot;
unassigned visible cards are counted as excluded, filtered-out cards and implementation-detail
children never enter it, and later query arrivals are never added. During execution each snapshot ID
is freshly read and guarded atomically by its State, Area Path, and Assigned To values before its
`System.IterationPath` changes. A card that became Done, unassigned, reassigned, or moved Lane is
skipped. Transient failures retry three times with backoff; a conflict returns to a fresh validation
pass, up to three times per card before that card is reported as failed, bounded overall to 100
passes and 10,000 confirmed items. Refresh, sprint/filter actions, and other
page interactions are blocked while the operation runs; leaving the page warns, Escape or **Cancel**
finishes the current write and skips the remainder, and the header reports moved/failed/skipped
counts with failures linked to Diagnostics. The header status stays live and clickable throughout —
it is the one region the interaction guard never blocks.

Right-clicking a card or descendant row opens Project Tracking's item commands: copy/open, title,
description, sprint, area, notes, and both blocker markers. Sprint alone opts into Interrupt
Tag/Accept/Clear commands. **Tag with Interrupt** carries an inline **Accepted** checkbox: toggling it
updates the pill preview and leaves the menu open. A proposed Interrupt writes directly. An accepted
Interrupt opens a titled Markdown editor with `@` mentions and requires a non-empty explanation;
the Accept button stays disabled until text exists. The configured acceptance token and explanation
then ride with the tag in one atomic patch. Accepting an existing Interrupt uses the same dialog.
Project Tracking deliberately does not expose those Interrupt mutation commands.

Team pills come from the configured team's complete paged roster, in server order, followed by
**Unassigned** when the loaded queue contains unassigned work. Query results retain only items
assigned to those members or unassigned, plus the parent chains needed to reach them. Every Lane and
Project choice is derived after that pruning, so out-of-team branches cannot contribute filter
options. Team pill queue and active counts include only configured Primary work; planning-context
ancestors and implementation descendants do not inflate either member or Unassigned totals. Counter
tooltips explain each displayed metric. Marker-tag pills
report one selected-sprint total, except **Interrupt**: it reports not-yet-accepted work followed by
accepted work in the current tagged lifetime, and collapses to one total when no interrupts are
waiting for acceptance.
Acceptance requires the configured acceptance token in a Discussion revision at or after the most
recent revision that added the Interrupt tag. Both views share this rule, so an old note cannot
survive an untag/re-tag cycle.
The **Project** filter offers only items whose configured types are parents of Primary-work types,
recursively through their planning ancestors, and whose branches contain work surviving the
selected sprint and other active filters. Primary-work and implementation-detail items are omitted.
The **Lane** filter derives its choices only from represented Primary-work area paths and offers only
leaves, omitting any root path that is an ancestor of another choice. The item menu's **Change area
path** works from a wider list, because a destination need not already hold work: every configured
default path, whether or not this sprint loaded anything in it, plus every path the loaded Primary
work sits in — represented ancestors included, minus the item's own. Like every other choice this
board derives, it ignores implementation details, so a child sitting off on its own path does not
turn that path into a destination.
Each Sprint View query binding can define full area paths initially selected when a sprint has no
team-shared Lane choice. Options edits them one at a time with autocomplete from the live project
area hierarchy and a remove button per path. A saved sprint selection, including an explicitly empty
one, takes priority over those binding defaults. Sprint selections are pulled on load, refresh, and sprint change; only
an actual Lane change publishes the full shared configuration. Dated records retain the newest ten
past sprints and prune older completed records when possible. Only lanes surviving the area-path selection are rendered. The Project filter keeps the selected
planning item and all direct or recursive descendants that belong to the selected sprint. Clicking
the active Project button clears that selection without opening the popup; clicking it again opens
the project choices.
The popup puts each work-item type icon before its title, colors options by type, expands toward the
window margin for long titles, and offers title search that keeps a matching item's parent chain
visible.
The header's top-right ordering indicator uses the shared Project Tracking picker. Backlog rank is
the default; title and ETA choices apply immediately to cards and descendant popup rows for the
current session.
All filter pills stay at full opacity; marker and recent-activity pills occupy separate wrapping
families with a larger gap between them.
Initial load, refresh, and sprint changes show `Loading spring data...`. The saved WIQL body loads in
parallel with sprint/roster discovery; item execution begins only after the team roster is ready. Sprint
offsets always rewrite the original body, never a previously rewritten copy. A sprint change also
re-derives Lane and Project choices and resets every filter. Sprint View always filters to the selected sprint: its sprint picker omits the filter
toggle because an unfiltered mode would contradict the view's purpose.

The card table uses the user's configured labels for Queue, Active, Waiting, and Done. Theme-owned
neutral, blue, amber, and green foregrounds make those labels distinct while the matching column
fills stay quiet. Each title also carries a right-aligned count chip of the Primary work the column
holds across every lane, tinted in that column's own hue and painted outside the title's backdrop so
it stays fully legible while the row is stuck. The title row stays lightly tinted in its resting
position, then switches to an
90%-opaque themed backdrop while sticky so cards passing beneath remain subtly visible.
It remains immediately below the dynamic-height control header; the filter pills scroll beneath it.
Each lane heading shows the only item total for that lane and
sticks vertically below the title row until the next lane pushes it away; its area name is emphasized
while the supporting count stays muted. Column chips and lane totals count only the Primary work the
board actually renders, so a lane's total always equals the sum of its four column counts. Only types explicitly
marked as Primary work in the configuration render as cards. Their complete non-primary descendant
trees are summarized on large cards by the shared completed/total child-items badge; its popup lists
every level in depth-first order with indentation, stopping at nested Primary work because that work
filters independently and renders as its own card. Each sibling level follows the active ordering
policy and uses the shared Assigned To and ETA controls. Queue,
Active, and Waiting cards use the tall format; Done cards start compact and expand on click or
keyboard activation. Both formats place the ID in the top-left corner and a tag-free shared Assigned
To control in the top-right, followed by the wrapped title. The shared `?` button beside the ID opens
Created, Last Modified, and the sanitized description in either size. The popup stays at least
280px wide, wraps long prose/code/table content without a horizontal scrollbar, and scrolls
vertically when its height exceeds 320px. A shared Priority chip sits on the same top row in both
sizes; it is read-only while a Done card is compact and editable after expansion. The row below places the shared ETA
control on the left and the child-items badge on the right. Assigned To and ETA remain visually
unchanged but read-only while a Done card is compact; expanding it restores editing for the card
itself. A Done card's child Assigned To and ETA controls, child title drag handles, and ancestor ETA
controls remain read-only in both sizes and use the default cursor. Tall cards additionally show the
immediate parent's type icon and title as a clickable, contrast-safe type-colored control. Its popup
lists ancestors from the root down to that immediate parent, each with its own type color and shared ETA control.
Tall cards also show only the three configured marker conditions (Blocked, Blocked by another team,
and Interrupt). Clicking a ready marker opens only the Discussion notes beginning with that marker's
configured comment token. Marker-specific notes are checked before the pill becomes interactive: an
empty result stays a plain pill with a `No notes` tooltip, while a clickable pill has no tooltip.
Reason rows hide the configured marker token and show only the explanation. A
type-colored edge identifies the work-item type.

Every card is draggable from its non-interactive surface. Parent hierarchy controls and other card
controls never initiate the owning card's drag. The cursor-following card is a custom 90%-opaque
clone that keeps the source card's original resolved background while moving across columns, making
the transparency visible without the browser's stronger native fade. The source card also remains at
90% opacity to mark its origin. A same-lane destination frames its
always-visible sticky column title with a border that uses the title's semantic color and is painted
above the sticky backdrop. Under backlog-rank ordering, the destination cell resolves every
pointer position, including gaps while reversing direction: a visible destination card gets an
in-place shadow showing the exact insertion slot, while an empty destination means append-last and
shows only the column highlight. Dropping can change state and backlog position together; the guarded
state patch runs first and its returned revision feeds the rank request inside one serialized queue
operation. Cross-lane drops remain rejected. Within the current column, backlog-rank mode previews an
insertion line and persists the card's manual rank. Title and ETA modes disable card and child
reordering while continuing to allow same-lane state changes. Direct children in non-Done cards can
be completed or reopened from their checkbox and dragged by title to persist their sibling rank
through the same serialized write queue. Completion in either direction repaints with the popup still
open. While a child popup is open, the owning card stops being a drag source and resumes only after
the popup closes; bubbled title drags never arm or get canceled by the card controller.

Both are registered centrally: the config in `../viewCatalog.ts`, the renderer in
`../enhancedViewRegistry.ts`.
