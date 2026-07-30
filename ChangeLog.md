# Changelog

All notable user-visible changes are recorded here. The package baseline is `0.1.0`; official
builds use the repository's `Major.Minor.Build` release versioning.

## Next Version

## 0.1

- Initial public release for Chrome and Microsoft Edge, supporting hosted Azure DevOps at
  `dev.azure.com` and `*.visualstudio.com`.
- Adds per-query enhancements with an AwesomeADO top-bar menu, synced query bindings, and a
  session-only switch between the enhanced view and Azure DevOps' standard view.
- Introduces the Project Tracking board: a theme-aware hierarchical view with sprint, area path,
  Feature Crew, recent activity, and blocker filters; configurable ordering; refresh; and compact
  child rollups.
- Supports inline work-item updates for status, priority, assignee, ETA, sprint, area path, title,
  description, and blocker markers, plus drag-and-drop ordering and hierarchy changes with
  conflict-aware Azure DevOps writes.
- Displays and edits Azure DevOps discussions and descriptions with sanitized rich text,
  screenshots, Markdown shortcuts, and real `@`-mention authoring and rendering.
- Adds Azure DevOps configuration for teams, areas, work-item mappings and hierarchy, ETA fields,
  marker tags, sprint windows, and per-query Project Tracking behavior.
- Provides Dark, Light, and Blue themes, plus Follow Azure DevOps, consistently across options,
  enhanced views, menus, controls, and status indicators.
- Adds synced configuration import/export and a device-local Diagnostics log with source and error
  filtering, while keeping query names and customer data out of exported diagnostics.
