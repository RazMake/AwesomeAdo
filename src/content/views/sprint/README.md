# `content/views/sprint`

The **Sprint View** presents a bound query's work as a sprint-filtered lane table. It accepts flat and
tree queries. Manual refresh keeps its filter state, while selecting another sprint destroys the
whole session and DOM so no filter, roster, or derived option survives the switch.

## Public API

- `sprintViewType.ts` -> `sprintViewType: ViewType` - id `"sprint"`, label `"Sprint View"`, and the
  recent-activity window in hours.
- `SprintView.ts` -> `sprintView: EnhancedView` - loads the original WIQL and configured team's
  members before executing the sprint-adjusted query; renders the sprint, Lane, Project, refresh, write-queue, team,
  marker, and recent-activity controls; and shows the filtered card table.
- `SprintBoard.ts` -> `renderSprintBoard` - groups cards by exact area-path lane and the first four
  configured application-state columns (Queue through Done), and persists drag-and-drop moves.
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
All filter pills stay at full opacity; marker and recent-activity pills occupy separate wrapping
families with a larger gap between them.
Initial load, refresh, and sprint changes show `Loading spring data...`. The saved WIQL body loads in
parallel with sprint/roster discovery; item execution begins only after the team roster is ready. Sprint
offsets always rewrite the original body, never a previously rewritten copy. A sprint change also
re-derives Lane and Project choices and resets every filter. Sprint View always filters to the selected sprint: its sprint picker omits the filter
toggle because an unfiltered mode would contradict the view's purpose.

The card table uses the user's configured labels for Queue, Active, Waiting, and Done, with
theme-owned neutral, blue, amber, and green column fills. Only types explicitly marked as Primary
work in the configuration render as cards. Their direct children are summarized by the shared
completed/total child-items badge; its popup lists only that first child level, regardless of which
types render as cards. Queue, Active, and Waiting cards use the tall format; Done cards start compact
and expand on click or keyboard activation. Both formats show the wrapped title, ID, assignee, and
child badge. Tall cards additionally show the immediate parent and only the three configured marker
conditions (Blocked, Blocked by another team, and Interrupt). A type-colored edge identifies the
work-item type.

Every card is draggable. Dropping into another state column writes that type's primary ADO state;
dropping into another lane writes `System.AreaPath`. A diagonal drop writes both fields in one
revision-guarded JSON Patch and reflects the move only after Azure DevOps accepts it.

Both are registered centrally: the config in `../viewCatalog.ts`, the renderer in
`../enhancedViewRegistry.ts`.
