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
  `{name} ({id})`, plus Delete) alongside a "Query View Configuration" card (the view picker and
  its per-view settings). Selecting a query loads its binding into the configuration card.
  Delete removes the current binding and auto-selects the next one; deleting the last binding returns
  the tab to its empty state.

The configuration card has **no Save button**: like every other settings page, each change is stored
the moment it is committed — on `change` for a text field (blur or Enter), immediately for a picker,
number, or area-path edit. A binding is only written once its required properties are answered,
because an incomplete view is one the content script cannot render; until then the status line names
what is still missing and the last valid binding stands. Nothing is announced for a save that worked
— a confirmation after every keystroke would be noise — so the line carries only what needs acting
on: a setting still blank, a refused write, or the outcome of a delete.

It supports two entry paths: a fixed query deep-linked from a query's top-bar button, and free
selection from the options page itself.

### Shared (read-only) queries

A query opened from someone else's shared link, when the user is **not** on that publisher's team,
is listed here alongside their own bindings but is **read-only**: the view picker is disabled and
each property is shown as its published value rather than as an input. Editing is
removed rather than merely discouraged — those values live in a work item this user cannot write to,
so an edit could only ever produce a local copy that silently diverges from the query
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
  whole-number field, an autocomplete over live Azure DevOps values, or the area-path list editor —
  seeded from the binding or the property's
  default with numbers forced back into range as you leave the field, storing each committed change
  at once. Its in-memory
  binding map is the form's working copy and is what a save writes back, so **`reload()`** re-reads
  the store and re-populates the form; call it when the bindings are replaced from outside the tab
  (a configuration file import). Delete outcomes and caught errors render inside the Query
  Enhancement Configuration card; the injected error callback records detail without creating a
  second page-level message. When team sharing is connected, the controller's `publishBindings`
  collaborator publishes the proposed full map before `bind`/`unbind` exposes it locally. This keeps
  Sprint's automatic pull from replacing a just-saved binding with the older team snapshot.
- **Derived values** — a property that declares a `derivedFrom` source is pre-filled from what the
  bound query itself says (its tag filter, the folder it is filed in), supplied by the injected
  `resolveDerivedValues` collaborator and read at most once per query. A seed only: a field the user
  has already filled is never overwritten, and a read that fails leaves the field empty and editable.
  A seed that does land is stored, so nothing sits on screen that the view will not see.
- **Suggestions** — the area-path and iteration-path vocabularies come from one broad credentialed
  Azure DevOps read, so the form deliberately does **not** wait for it: it opens with empty lists and
  every rendered control is refreshed when the values land. Waiting was what made this tab look like
  it never loaded.
- **Saved-query folders load a folder at a time** — see `QueryFolderVocabulary.ts` below. The folder
  control shows a spinner inside its own trailing edge, and exposes `aria-busy`, whenever a folder is
  being read; it stays editable throughout, and a suggestion clipped to the textbox width exposes its
  complete path as a hover tooltip.
- **`QueryBindingsElements`** — the tab's elements the controller drives (the empty state, the add
  card's read-only query line, view picker and Save; the edit card's query picker and Delete; the view
  config card's view picker and property container; and the shared status line), passed in so it
  stays testable without a real DOM.
- **`CurrentQueryIdResolver`** — an injected `() => Promise<string | null>` the controller uses to
  preselect the query the active ADO tab is on.
- **`SharedQueryAccess`** — `{ sources, resolver }`: the synced read-only links and the memoizing
  reader for the work items they point at. Optional; omitting it means this build shows no shared
  queries. The resolver memoizes per work item, so a team that shares five queries from one item is
  read once, and `reload()` invalidates it before re-resolving.

### `QueryFolderVocabulary.ts`

- **`QueryFolderVocabulary`** — the saved-query folders the folder field offers, grown one folder at
  a time. `loadRoot()` reads the folders the picker starts from (one Azure DevOps request), `paths`
  is what to suggest right now, and `loading` is true while any read is outstanding. `expand(typed)`
  opens the folder the typed or picked text names or sits inside — the **deepest** matching one, at
  most once each, and **only** when Azure DevOps said that folder still holds folders it did not hand
  over. That check is what keeps a leaf folder free. Nothing here is awaited by the form: the field
  stays typable throughout, a path no suggestion matches is still perfectly valid, and a refused read
  costs suggestions and nothing else.

  **Why not just list the project's folders:** Azure DevOps expands the hierarchy two levels per
  request and caps a node at 1000 children, so a large project cannot be enumerated — and crawling
  towards the deeper folders up front is hundreds of dependent requests, which is what made this
  field take minutes to fill.

### `AreaPathListEditor.ts`

- **`AreaPathListEditor`** — presents the newline-backed binding value as an Add autocomplete and one
  editable autocomplete row per full area path. Each row has its own remove button. Suggestions are
  the live project classification paths supplied by the options composition root, and
  `setSuggestions(values)` swaps them in when that read finishes after the editor is already on
  screen; typed custom paths remain valid, and duplicates are ignored case-insensitively. Add is
  disabled while its textbox is blank, action buttons sit immediately after their textboxes, and the
  property description sits between the Add row and the editable rows.

## Usage guidance

Construct `QueryBindingsController` at the options composition root with the shared binding store, the
elements, a binding-scoped diagnostics callback, a query-id resolver backed by the ADO tab reader,
a suggestion resolver, the two saved-query folder readers (`resolveRootFolders` from the shared
metadata read, `resolveFolderChildren` from `ChromeQueryFolderReader`), and a derived-value resolver
backed by the shared ADO query read (see `src/options/index.ts`).
