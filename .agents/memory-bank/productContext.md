# Product Context

## Problem

Azure DevOps Query pages do not present saved queries the way every team wants. Users need a way to
replace an ADO query's default page with an enhanced, purpose-built view — and to do it per query,
because the same query can matter differently in different contexts — without disrupting the rest of
their ADO workflow.

## Target Audience

Developers and project managers who use Azure DevOps (`dev.azure.com` or `*.visualstudio.com`) daily
and want per-query control over how their saved queries are presented.

## Desired UX

1. **Install** AwesomeADO from the Chrome Web Store or Microsoft Edge Add-ons store.
2. On any saved-query page, an **"Enhance with AwesomeADO" button** appears in ADO's top command
   bar. Unbound queries are otherwise untouched — ADO's own page is left intact.
3. From the button's menu, **enable the enhanced view** for that query: the options page opens
   pre-selected to bind it to a view type (`Sprint View` or `Project Tracking`).
4. A bound query shows its **enhanced view**; its menu can flip it back to ADO's **Standard View**
   for that one query without losing the binding, or disable (unbind) it entirely. This flip is a
   **tab-local choice** (kept in the tab's `sessionStorage`, not synced) that survives F5 and
   outranks the configured default; flipping to the standard grid may reload the page so ADO
   re-fetches, while flipping back to the enhanced view refreshes in place. A separate **"make this
   my default"** action writes the synced per-query default, which takes effect on the next
   navigation to the query.
5. The **options page** lets the user choose Dark, Light, or Blue (`Follow Azure DevOps` automatically
   selects only Dark or Light), see the active query tab's organization/project, choose the global
   default view (which applies only to bound queries), and manage per-query bindings.
6. **Synced settings** (theme, global default view, per-query bindings and defaults) follow the user
   across devices via `chrome.storage.sync`, while the **tab-local view override** (point 4) stays on
   the one tab. The extension follows ADO's **SPA navigation**, so moving into or out of a query
   updates instantly with no reload; the only deliberate reload is flipping a query back to ADO's
   standard grid **when its data changed**, so ADO re-fetches the latest.
