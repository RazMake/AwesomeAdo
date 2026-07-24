# src/content/query-binding

The AwesomeADO top-bar button and its popup menu, plus the controller that decides when they appear
and what they offer.

## Purpose

On an ADO Query route the extension adds a button to the page's top bar. Clicking it opens a menu to
open Options, enable/disable the enhanced view for the current query, switch a bound query's active
view, and view the diagnostics log. This component owns the button/menu DOM and the policy for when
they are shown; it depends on injected settings/bindings snapshots rather than reading storage
itself.

Lines it records use the log source **`content/query-binding`**.

## Public API

### `BindingButton.ts`

- **`BindingButton`** — DOM widget that injects and maintains the top-bar button, re-attaching it
  when ADO re-renders its header. Exposes show/hide so the controller drives visibility.

### `BindingMenu.ts`

- **`BindingMenu`** — self-contained popup menu anchored to a trigger element, themed to match ADO.
- **`MenuEntry`** = **`MenuItem`** | **`MenuSeparator`** — the entry shapes the controller passes in
  to describe the menu contents.

### `QueryBindingController.ts`

- **`QueryBindingController`** — owns the button's visibility policy and the menu contents; reacts to
  navigation, the synced bindings, the default view, and whether ADO settings are complete.
- **`QueryMenuActions`** — the callbacks the composition root supplies for each menu action
  (open Options, enable/disable enhanced view, switch active view, view log), so the controller stays
  free of any knowledge about opening extension pages or writing storage.

## Usage guidance

The controller is DOM-agnostic: it is given a `BindingButton`, a `BindingMenu`, a `QueryMenuActions`,
the current URL, and an `ILogger` at the composition root. Construct the chrome-backed pieces only
there (see `src/content/index.ts`).
