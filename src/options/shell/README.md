# src/options/shell

The options page shell: tab navigation that switches which panel is shown.

## Purpose

Wires the page's ARIA tablist so activating a tab reveals its panel and hides the rest. This is
cross-cutting page structure, not a feature panel — the composition root uses it to switch sections,
including deep links from the top-bar "Options"/"View Log" menu.

This component does not log.

## Public API

### `TabsController.ts`

- **`TabsController`** — binds the tablist: `init()` wires the click/ARIA behavior, and
  `activate(tabId)` switches to a section in place (used for deep links and the live section-reveal
  message). Pure DOM, no business logic.

## Usage guidance

Construct `TabsController` with the page `document` at the options composition root and call `init()`
once; use `activate(...)` to jump to a requested section (see `src/options/index.ts`).
