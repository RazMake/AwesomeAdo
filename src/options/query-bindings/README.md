# src/options/query-bindings

The options page's **Query Bindings** tab: create, edit, and delete query-to-enhanced-view mappings.

## Purpose

Lets the user bind an ADO query to an enhanced presentation and pick its active/primary view. It
supports two entry paths: a fixed query deep-linked from a query's top-bar button, and free selection
from the options page itself.

This component does not log; it surfaces failures through the options page's shared error sink.

## Public API

### `QueryBindingsController.ts`

- **`QueryBindingsController`** — drives the binding form (pick a query, choose a view, save, delete)
  against the synced query-binding store.
- **`QueryBindingsElements`** — the form elements the controller drives, passed in so it stays
  testable without a real DOM.
- **`CurrentQueryIdResolver`** — an injected `() => Promise<string | null>` the controller uses to
  preselect the query the active ADO tab is on.

## Usage guidance

Construct `QueryBindingsController` at the options composition root with the shared binding store, the
elements, the page's `report` error sink, and a resolver backed by the ADO tab reader
(see `src/options/index.ts`).
