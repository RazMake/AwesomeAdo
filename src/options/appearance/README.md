# src/options/appearance

The options page's **Appearance** panel: theme and default-view preferences.

## Purpose

Binds the Appearance controls to the synced settings store and keeps the page's own rendered theme in
sync with the user's choice, resolving `"auto"` against the theme the active ADO tab is rendering.

This component does not log; it surfaces failures through the options page's shared error sink.

## Public API

### `OptionsController.ts`

- **`OptionsController`** — binds the theme and default-view `<select>`s to the settings store and
  applies the resolved theme to the page root. Takes an `OptionsElements` bundle so it stays testable
  without a real DOM.
- **`OptionsElements`** — the elements the controller drives (page root plus the theme and
  default-view selects).

### `theme.ts`

- **`resolveTheme(setting, adoTheme)`** — resolves a stored `Theme` preference (`"auto"`/`"light"`/
  `"dark"`/`"blue"`) into a **`ConcreteTheme`** (`"light"`/`"dark"`/`"blue"`), falling back to the
  ADO tab's theme when the preference is `"auto"`.
- **`ConcreteTheme`** — the resolved, renderable theme union.

## Usage guidance

Construct `OptionsController` at the options composition root with the shared settings store, the ADO
tab reader, the elements, and the page's `report` error sink (see `src/options/index.ts`).
