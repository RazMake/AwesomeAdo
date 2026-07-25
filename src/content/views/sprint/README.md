# `content/views/sprint`

The **Sprint View**: presents a bound query's work grouped by sprint. This folder holds both halves
of the view — its configuration and its renderer.

## Public API

- `sprintViewType.ts` → `sprintViewType: ViewType` — the view's config. Id `"sprint"`, label
  `"Sprint View"`, and (for now) no properties, so a query can be bound to it as-is.
- `SprintView.ts` → `sprintView: EnhancedView` — the renderer. Today it paints the shared
  [`renderViewScaffold`](../../../common/view-common/control/ViewScaffold/README.md) placeholder with sprint-specific copy; the sprint
  board grows in here later, reusing the shared view components.

Both are registered centrally: the config in `../viewCatalog.ts`, the renderer in
`../enhancedViewRegistry.ts`.
