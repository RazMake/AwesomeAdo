# `content/views/sprint`

The **Sprint View** presents a bound query's work as a sprint-filtered queue. It accepts flat and
tree queries and keeps its header/filter state for the lifetime of the mounted view.

## Public API

- `sprintViewType.ts` -> `sprintViewType: ViewType` - id `"sprint"`, label `"Sprint View"`, and the
  recent-activity window in hours.
- `SprintView.ts` -> `sprintView: EnhancedView` - loads the query tree, sprint window, and selected
  iteration's capacity roster; renders the sprint, Lane, Project, refresh, write-queue, team,
  marker, and recent-activity controls; and shows the filtered item queue.
- `SprintHeader.ts` -> `renderSprintHeader` - assembles the sticky, theme-aware control card.

Team pills come from the selected sprint's capacity roster. An **Unassigned** pill appears when the
loaded queue contains unassigned work. Team pills report queue and active counts. Marker-tag pills
report one selected-sprint total, except **Interrupt**: it reports not-yet-accepted work followed by
accepted-in-sprint work, and collapses to one total when no interrupts are waiting for acceptance.
The **Project** filter offers only items whose configured types are parents of Primary-work types,
recursively through their planning ancestors, and whose branches contain work surviving the
selected sprint and other active filters. Primary-work and implementation-detail items are omitted.
The popup colors options by work-item type, expands toward the window margin for long titles, and
offers title search that keeps a matching item's parent chain visible.
All filter pills stay at full opacity; marker and recent-activity pills occupy separate wrapping
families with a larger gap between them.
Refresh reloads both work items and capacity, so the roster never outlives the sprint data it
describes. Sprint View always filters to the selected sprint: its sprint picker omits the filter
toggle because an unfiltered mode would contradict the view's purpose.

Both are registered centrally: the config in `../viewCatalog.ts`, the renderer in
`../enhancedViewRegistry.ts`.
