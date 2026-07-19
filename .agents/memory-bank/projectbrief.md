# Project Brief

## North Star

**AwesomeADO** is a Chrome + Edge (Chromium MV3) browser extension that enhances Azure DevOps
Query pages. It is published to both the Chrome Web Store and the Microsoft Edge Add-ons store from
a single codebase.

## What it does today

- **Per-query bindings.** Each saved ADO query (identified by the GUID in
  `/_queries/query/{guid}`) can be bound to an enhanced **view type** (`Sprint View` or
  `Project Tracking`) with its own per-query properties. Bindings sync across the signed-in user's
  devices via `chrome.storage.sync`.
- **Top-bar button + menu.** An "Enhance with AwesomeADO" button is injected into the ADO top
  command bar on any single-query route. Its popup menu enables the enhanced view for a query
  (binds it), switches a bound query between its enhanced view and ADO's Standard View, opens the
  options page, or disables (unbinds) the query.
- **Enhanced view.** For a query resolved to its enhanced view, the content script reversibly
  blanks the page below ADO's breadcrumb bar (`PageBlanker`) as the current enhancement surface.
  Unbound queries are always left on ADO's own view — only the button is injected.
- **Options page.** A themeable, tabbed page (Appearance, Query Bindings, Diagnostics placeholder):
  a Theme selector (`Auto`/`Light`/`Dark`/`Blue`, where `Auto` follows ADO's own theme detected
  from the live tab), a read-only ADO Configuration panel showing the active query tab's
  organization/project, a Default view selector (`Original ADO View`/`Enhanced View`) that applies
  only to bound queries, and a Query Bindings manager (bind a specific query opened from its button,
  or pick from open/bound queries).
- **SPA-aware.** The content script is injected host-wide and reacts to ADO's in-page navigation, so
  entering or leaving a Query route updates the button and blanking without a full reload.

## Scope boundaries

- **Hosted ADO only.** `dev.azure.com` and `*.visualstudio.com`. No on-prem Azure DevOps Server
  support.
- **Quality gate.** Test coverage ≥ 85% for `src/**` (lines, functions, branches, statements),
  full lint/format/duplication enforcement, VS Code run/debug tasks, git hooks, and a
  changelog-validated CI/CD build + release pipeline.

## Version base

Initial version base is `0.1`. The developer owns `Major.Minor`; CI computes the build number. See
`ChangeLog.md` and the changelog-versioning skill for the release protocol.
