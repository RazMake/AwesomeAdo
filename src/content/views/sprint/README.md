# `content/views/sprint`

The **Sprint View** presents a bound query's work as a sprint-filtered lane table. It accepts flat and
tree queries. Manual refresh keeps its filter state, while selecting another sprint destroys the
whole session and DOM so no filter, roster, or derived option survives the switch.

## Public API

- `sprintViewType.ts` -> `sprintViewType: ViewType` - id `"sprint"`, label `"Sprint View"`, and the
  per-query ordering policy plus recent-activity window in hours.
- `SprintView.ts` -> `sprintView: EnhancedView` - loads the original WIQL and configured team's
  members before executing the sprint-adjusted query; renders the sprint, Lane, Project, refresh, write-queue, team,
  marker, and recent-activity controls; and shows the filtered card table.
- `SprintBoard.ts` -> `renderSprintBoard` - groups cards by exact area-path lane and the first four
  configured application-state columns (Queue through Done), keeps their horizontally synchronized
  titles sticky below the control header, keeps each lane's name and item count visible until the
  next lane pushes it away, and persists card and direct-child drag-and-drop moves.
- `SprintHeader.ts` -> `renderSprintHeader` - assembles the sticky, theme-aware control card with
  the query's clickable parent-folder breadcrumb trail at the top.

Team pills come from the configured team's complete paged roster, in server order, followed by
**Unassigned** when the loaded queue contains unassigned work. Query results retain only items
assigned to those members or unassigned, plus the parent chains needed to reach them. Every Lane and
Project choice is derived after that pruning, so out-of-team branches cannot contribute filter
options. Team pill queue and active counts include only configured Primary work types and their
recursively configured child types; planning-context ancestors do not inflate either member or
Unassigned totals. Counter tooltips explain each displayed metric. Marker-tag pills
report one selected-sprint total, except **Interrupt**: it reports not-yet-accepted work followed by
accepted-in-sprint work, and collapses to one total when no interrupts are waiting for acceptance.
The **Project** filter offers only items whose configured types are parents of Primary-work types,
recursively through their planning ancestors, and whose branches contain work surviving the
selected sprint and other active filters. Primary-work and implementation-detail items are omitted.
The **Lane** filter derives its choices from represented area paths and offers only leaves, omitting
any root path that is an ancestor of another choice.
Only lanes surviving the area-path selection are rendered. The Project filter keeps the selected
planning item and all direct or recursive descendants that belong to the selected sprint.
The popup colors options by work-item type, expands toward the window margin for long titles, and
offers title search that keeps a matching item's parent chain visible.
The header's top-right ordering indicator uses the shared Project Tracking picker. Backlog rank is
the default; title and ETA choices apply immediately to cards and direct-child popup rows for the
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
fills stay quiet. The title row stays lightly tinted in its resting position, then switches to an
90%-opaque themed backdrop while sticky so cards passing beneath remain subtly visible.
It remains immediately below the dynamic-height control header; the filter pills scroll beneath it.
Each lane heading shows the only item total for that lane and
sticks vertically below the title row until the next lane pushes it away; its area name is emphasized
while the supporting count stays muted. Only types explicitly
marked as Primary work in the configuration render as cards. Their direct children are summarized by the shared completed/total child-items
badge; its popup lists only that first child level, regardless of which types render as cards, ordered
by the active policy with the shared Assigned To and ETA controls. Queue,
Active, and Waiting cards use the tall format; Done cards start compact and expand on click or
keyboard activation. Both formats place the ID in the top-left corner and a tag-free shared Assigned
To control in the top-right, followed by the wrapped title. The row below places the shared ETA
control on the left and the child-items badge on the right. Assigned To and ETA remain visually
unchanged but read-only while a Done card is compact; expanding it restores editing for the card
itself. A Done card's child Assigned To and ETA controls, child title drag handles, and ancestor ETA
controls remain read-only in both sizes and use the default cursor. Tall cards additionally show the
immediate parent's type icon and title as a clickable, contrast-safe type-colored control. Its popup
lists ancestors from the root down to that immediate parent, each with its own type color and shared ETA control.
Tall cards also show only the three configured marker conditions (Blocked, Blocked by another team,
and Interrupt). A type-colored edge identifies the work-item type.

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
be dragged by title to persist their sibling rank through the same serialized write queue. While a
child popup is open, the owning card stops being a drag source and resumes only after the popup
closes.

Both are registered centrally: the config in `../viewCatalog.ts`, the renderer in
`../enhancedViewRegistry.ts`.
