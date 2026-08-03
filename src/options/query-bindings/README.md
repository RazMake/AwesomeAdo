# src/options/query-bindings

The options page's **Query Bindings** tab: create, edit, and delete query-to-enhanced-view mappings.

## Purpose

Lets the user bind an ADO query to an enhanced presentation and manage every existing binding. The
tab has two mutually exclusive layouts, chosen from what is in context:

- **Add mode** — a single "Add enhanced query" card shown when the query in context is not yet bound.
  It displays one read-only "ADO Query to enhance" line naming the query (its id italicised), a view
  picker, and Save. Saving persists the binding with the chosen view's default settings (so navigating
  away keeps them) and switches the tab to edit mode for that query.
- **Edit mode** — an "Edit enhanced query" card (a picker over every bound query, each labelled
  `{name} ({id})`, plus Delete) alongside a "Query View Configuration" card (the view picker,
  its per-view settings, and Save). Selecting a query loads its binding into the configuration card.
  Delete removes the current binding and auto-selects the next one; deleting the last binding returns
  the tab to its empty state.

It supports two entry paths: a fixed query deep-linked from a query's top-bar button, and free
selection from the options page itself.

### Shared (read-only) queries

A query opened from someone else's shared link, when the user is **not** on that publisher's team,
is listed here alongside their own bindings but is **read-only**: the view picker is disabled, Save
is hidden, and each property is shown as its published value rather than as an input. Editing is
removed rather than merely discouraged — those values live in a work item this user cannot write to,
so an enabled Save could only ever produce a local copy that silently diverges from the query
everyone else is looking at.

A notice names the work item the configuration comes from, and Delete becomes **Remove link**, which
drops the link instead of deleting a binding the user never owned. Values refresh the same way the
ordinary path does: the tab re-resolves the work item whenever the configuration is reloaded.

This component does not log; it surfaces failures through the options page's shared error sink.

## Public API

### `QueryBindingsController.ts`

- **`QueryBindingsController`** — drives both layouts against the synced query-binding store: in add
  mode it saves a new binding from the view picker; in edit mode it switches the selected query and
  view, renders one control per property of the selected view — text, a select, a range-bounded
  whole-number field, or the area-path list editor — seeded from the binding or the property's
  default with numbers forced back into range as you leave the field, and saves or deletes the binding. Its in-memory
  binding map is the form's working copy and is what a save writes back, so **`reload()`** re-reads
  the store and re-populates the form; call it when the bindings are replaced from outside the tab
  (a configuration file import). Save/delete outcomes and caught errors render inside the Query
  Enhancement Configuration card; the injected error callback records detail without creating a
  second page-level message. When team sharing is connected, the controller's `publishBindings`
  collaborator publishes the proposed full map before `bind`/`unbind` exposes it locally. This keeps
  Sprint's automatic pull from replacing a just-saved binding with the older team snapshot.
- **`QueryBindingsElements`** — the tab's elements the controller drives (the empty state, the add
  card's read-only query line, view picker and Save; the edit card's query picker and Delete; the view
  config card's view picker, property container and Save; and the shared status line), passed in so it
  stays testable without a real DOM.
- **`CurrentQueryIdResolver`** — an injected `() => Promise<string | null>` the controller uses to
  preselect the query the active ADO tab is on.
- **`SharedQueryAccess`** — `{ sources, resolver }`: the synced read-only links and the memoizing
  reader for the work items they point at. Optional; omitting it means this build shows no shared
  queries. The resolver memoizes per work item, so a team that shares five queries from one item is
  read once, and `reload()` invalidates it before re-resolving.

### `AreaPathListEditor.ts`

- **`AreaPathListEditor`** — presents the newline-backed binding value as an Add autocomplete and one
  editable autocomplete row per full area path. Each row has its own remove button. Suggestions are
  the live project classification paths supplied by the options composition root; typed custom paths
  remain valid, and duplicates are ignored case-insensitively. Add is disabled while its textbox is
  blank, action buttons sit immediately after their textboxes, and the property description sits
  between the Add row and the editable rows.

## Usage guidance

Construct `QueryBindingsController` at the options composition root with the shared binding store, the
elements, a binding-scoped diagnostics callback, a query-id resolver backed by the ADO tab reader,
and an area-path resolver backed by the shared ADO metadata read (see `src/options/index.ts`).
