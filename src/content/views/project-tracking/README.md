# `content/views/project-tracking`

The **Project Tracking View**: presents a bound query's items grouped for status tracking, with
per-query control over ordering and several "recent activity" windows. This folder holds both halves
of the view — its configuration and its renderer.

## Public API

- `projectTrackingViewType.ts` → `projectTrackingViewType: ViewType` — the view's config. Id
  `"projectTracking"`, label `"Project Tracking"`, with these per-query properties:
  - `orderingPolicy` (select) — how items are ordered within each group; choices and the default
    come from [`common/ordering`](../../../common/ordering), which also resolves the raw sort key.
  - `weeks` (number) — how far back per-item Updates reach.
  - `days` (number) — hide resolved items once resolved more than this many days ago.
  - `hours` (number) — rolling window behind the "newly created / updated / new notes" pills.
- `ProjectTrackingView.ts` → `projectTrackingView: EnhancedView` — the renderer. Today it paints the
  shared [`renderViewScaffold`](../shared/README.md) placeholder with tracking-specific copy; the
  tracking board grows in here later.

Because every property is stored on the binding, the same view bound to two queries can use
different windows. Both halves are registered centrally: the config in `../viewCatalog.ts`, the
renderer in `../enhancedViewRegistry.ts`.
