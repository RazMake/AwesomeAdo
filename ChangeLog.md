# Changelog

All notable changes are recorded here. The build system combines the developer-owned
Major.Minor with a CI build number to form Major.Minor.Build.

## Next Version

## 0.1 - Initial scaffolding and basic functionality

- Initial release of the AwesomeADO MV3 extension for Chrome and Edge, including CI/Release pipelines with an immutable release workflow and changelog-validated versioning, and the AwesomeADO icon (an Azure DevOps work-item card with a checkmark and sparkle) shown in the browser toolbar and extensions list.
- Added per-query bindings: each Azure DevOps query can be bound to a view (Sprint View or Project Tracking) with its own settings, so the same view can be configured differently per query. Bindings sync across your devices.
- Added an "Enhance with AwesomeADO" button to the Azure DevOps top bar that appears on any saved query page (bound or not) and opens a popup menu aligned under it. The button shows the extension icon (its purpose stays available as a tooltip and to screen readers) and sits inside the Azure DevOps top-bar command bar alongside ADO's own icons, styled to match them (flat square button with the same hover highlight). On an unbound query the menu offers Options and "Enable Enhanced View" (which opens the options page to bind that query); on a bound query the menu lets you switch that query between its bound view (e.g. Sprint View) and ADO's Standard View, open Options, or "Disable Enhanced View" to remove the binding. The per-query view choice is remembered, synced across your devices, and overrides the global default view.
- Unbound Azure DevOps queries are always left on ADO's own view — the extension only injects its button and never replaces the page until you bind the query. The global Default view applies only to bound queries, and query-page enhancement hides only the content below the top breadcrumb bar, keeping ADO's breadcrumb navigation visible.
- Themeable, tabbed options page (Appearance, Query Bindings, and a Diagnostics placeholder), with a Theme selector (Auto/Light/Dark/Blue, where Auto follows Azure DevOps' own theme), a read-only ADO Configuration panel showing the active tab's organization and project, and a Default view selector (Original ADO View / Enhanced View). The options page header shows the AwesomeADO icon.
- The Query Bindings tab manages per-query view bindings: open it from a query's AwesomeADO button to bind that query (its name is shown read-only), or open it from the button's Options menu to pick from the queries you have open (and any already-bound queries) in a dropdown. Each query can be given an Enhanced View Type, saved, or deleted (unbound), so several queries can each be managed independently.
- The options page detects open ADO Query tabs regardless of which tab is focused, so opening the options tab in the foreground no longer hides the active query's organization and project. It also shows a visible error message when it fails to load or hits an error later, instead of failing silently.
- Auto theme reads Azure DevOps' theme color token instead of the page's white loading fallback, so a Dark ADO account is no longer misread as Light (no options-page white flash).
- The button's "Options" and "Enable Enhanced View" menu items reliably open the options page; failures to open it are now reported instead of being silently ignored.
