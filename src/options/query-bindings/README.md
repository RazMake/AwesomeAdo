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

This component does not log; it surfaces failures through the options page's shared error sink.

## Public API

### `QueryBindingsController.ts`

- **`QueryBindingsController`** — drives both layouts against the synced query-binding store: in add
  mode it saves a new binding from the view picker; in edit mode it switches the selected query and
  view, renders one input per property of the selected view — text or a range-bounded whole-number
  field, seeded from the binding or the property's default with numbers forced back into range as you
  leave the field — and saves or deletes the binding.
- **`QueryBindingsElements`** — the tab's elements the controller drives (the empty state, the add
  card's read-only query line, view picker and Save; the edit card's query picker and Delete; the view
  config card's view picker, property container and Save; and the shared status line), passed in so it
  stays testable without a real DOM.
- **`CurrentQueryIdResolver`** — an injected `() => Promise<string | null>` the controller uses to
  preselect the query the active ADO tab is on.

## Usage guidance

Construct `QueryBindingsController` at the options composition root with the shared binding store, the
elements, the page's `report` error sink, and a resolver backed by the ADO tab reader
(see `src/options/index.ts`).
