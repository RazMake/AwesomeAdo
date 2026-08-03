# Changelog

All notable user-visible changes are recorded here. The package baseline is `0.1.0`; official
builds use the repository's `Major.Minor.Build` release versioning.

## Next Version

- Adds a Quick Bootstrap link to Configuration Sharing: one copyable Azure DevOps link that opens an
  enhanced query already pointed at your team's shared configuration, so a teammate can be set up
  over Teams or email without exporting or importing anything. It appears only once you are
  connected to a configuration work item and have at least one enhanced query.

## 0.3

- Makes Sprint and Project Tracking filters evaluate only Primary work, while preserving arbitrarily
  deep planning context and showing the complete implementation-detail tree beneath matching work.
- Adds a color-matched count to every Sprint View column heading, showing how much Primary work sits
  in that column across all lanes and staying readable while the headings are stuck to the top. Lane
  totals now match those counts exactly.
- Tells you when the filters have hidden everything in Sprint View and Project Tracking, instead of
  leaving a blank area that looks like the view failed to load. The diagnostics log records the
  filter selections that emptied the board, so an empty board can be explained after the fact.

## 0.2

- Introduces Sprint View, a team-focused lane-by-status board with sprint, Lane, Project, team
  member, marker, and recent-activity filters; query-folder breadcrumbs; work counts; configurable
  ordering; compact completed cards; child progress; and drag-and-drop state and rank changes.
- Adds complete Sprint planning actions for titles, descriptions, sprints, area paths, assignees,
  ETAs, priorities, discussions, blockers, child completion, and child ordering. Teams can also
  track and accept Interrupts with a reason, and safely move the visible assigned work from a past
  sprint to a current or future sprint after reviewing a Lane-and-assignee summary.
- Adds per-query default Sprint Lanes and team-shared Lane selections for each sprint, with searchable
  area-path setup, multi-select filtering, reset-to-default, and import/export support.
- Adds a Primary work classification that distinguishes independently trackable delivery from
  planning context and implementation details. Sprint View and Project Tracking use it to keep
  delivery work prominent while retaining the surrounding hierarchy and compact child rollups.
- Makes the Azure DevOps organization and project editable, persistent settings. Configuration can
  now use any open Azure DevOps tab, remains available when no tab is open, and clearly disables only
  the controls that need live Azure DevOps access.
- Expands team sharing with connection-only exports and shareable query links. Teammates can follow
  live shared configuration without replacing their own query list, while people outside the team
  receive a read-only enhancement for only the shared query and keep their own settings untouched.

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
