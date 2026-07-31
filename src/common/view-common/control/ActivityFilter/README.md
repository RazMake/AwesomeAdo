# ActivityFilter

Shared recent-activity controls and predicates for enhanced views.

- `renderActivityFilterPills` returns the three full-opacity filter buttons so a view can place them
  in its activity family. The shared family layout separates them from other filter pills.
- `matchesRecentActivity` applies OR semantics across selected activity kinds.
- `RecentNotesIndex` bulk-loads and caches newest discussion dates for the **New notes** filter.

Views provide the rolling window, selected set, note reader, logger, and repaint callback.
