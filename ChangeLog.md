# Changelog

All notable user-visible changes are recorded here. The package baseline is `0.1.0`; official
builds use the repository's `Major.Minor.Build` release versioning.

## Next Version

- Adds a Primary work classification to the work-item hierarchy, distinguishing independently
  trackable delivery from planning context and implementation details while keeping the root as
  context. Project Tracking shows Primary work and its planning ancestors as tree rows, while
  implementation-detail children remain in the compact child-items badge, updating an open view
  immediately when the hierarchy setting changes.
- Adds the first Sprint View workflow: an always-active sprint selector, Lane, Project,
  team-member, marker, and recent activity filters; concise tag totals with waiting/accepted
  Interrupt counts; Lane choices limited to leaf area paths; Project choices limited to planning
  parents of Primary work relevant to the visible work, with type colors, responsive long-title
  handling, and hierarchy-preserving title search; clickable query-folder breadcrumbs; and a
  filtered lane-by-state card table using configured column labels and themed Queue, Active,
  Waiting, and Done colors. Only configured Primary-work types render as cards; cards show type
  color, title, ID, assignee, and a completed/total badge that opens their direct children. Tall
  cards add recognized markers and immediate parent context, while compact Done cards expand on demand.
  Dragging a card changes its application state or area-path lane, with diagonal moves committed as
  one atomic Azure DevOps revision. Initial load, refresh, and sprint changes now page the configured team's
  complete roster before executing an offset-adjusted copy of the saved WIQL, keep only team-assigned
  or unassigned work plus its parent chains, derive Lane and Project choices from that retained work,
  and fully reset the view and filters when switching sprints. Member and Unassigned counters include
  only Primary work and its configured descendants, with hover explanations for pill metrics. Team-member access and failures are
  logged with transport detail for diagnostics. Query-definition failures now
  distinguish a stale background worker, malformed request, unsupported tab location, injection
  failure, network exhaustion, invalid JSON, and HTTP errors instead of collapsing them to HTTP 0.
- Refines enhanced-view filters with compact pills aligned to Project Tracking's user tags and a
  larger gap between full-opacity filter families in Sprint View and Project Tracking.
- Keeps Primary Work classification intact through team configuration pull and publish, and links a
  successful publish's work item ID directly to the item in Azure DevOps.
- Removes the unused Area Paths configuration: Sprint View and Project Tracking continue deriving
  their area filters and edit choices directly from the query's live work items, while export,
  import, team publish, and team pull no longer carry pinned paths.

## 0.1

- Initial release for Chrome and Microsoft Edge, adding per-query enhancements to hosted Azure
  DevOps at `dev.azure.com` and `*.visualstudio.com`, with synced query bindings, top-bar controls,
  and session-only switching between AwesomeADO and the standard view.
- Introduces the Project Tracking board: a theme-aware hierarchical view with sprint, area path,
  Feature Crew, recent activity, and blocker filters; configurable ordering; refresh; and compact
  child rollups.
- Supports inline work-item updates for status, priority, assignee, ETA, sprint, area path, title,
  description, and blocker markers, plus drag-and-drop ordering and hierarchy changes with
  conflict-aware Azure DevOps writes.
- Displays and edits Azure DevOps discussions and descriptions with sanitized rich text,
  screenshots, Markdown shortcuts, `@`-mentions, and a maximizable View all notes surface.
- Adds Azure DevOps configuration for teams, areas, work-item mappings and hierarchy, ETA fields,
  marker tags, sprint windows, and per-query Project Tracking behavior.
- Provides Dark, Light, and Blue themes, plus Follow Azure DevOps, consistently across options,
  enhanced views, menus, controls, and status indicators, including live Dark and Light updates when
  following Azure DevOps.
- Supports configuration import/export and team sharing through an Azure DevOps work item, with
  automatic pulls and explicit conflict-aware publishing.
- Includes a device-local Diagnostics log with source and error filtering that keeps query names and
  customer data out of exported diagnostics.
