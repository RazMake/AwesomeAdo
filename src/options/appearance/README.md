# src/options/appearance

The options page's **Appearance** panel: theme and default-view preferences.

## Purpose

Binds the Appearance controls to the synced settings store and keeps the page's own rendered theme in
sync with the user's choice. `"auto"` follows the active ADO tab by resolving to AwesomeADO's Dark
or Light theme; Blue remains an explicit choice.

This component does not log; it surfaces failures through the options page's shared error sink.

## Public API

### `OptionsController.ts`

- **`OptionsController`** — binds the theme and default-view `<select>`s to the settings store and
  applies the resolved theme's shared CSS variables to the page root. It builds the theme selector
  from `common/view-common/themes`, so registering a theme makes it selectable without adding HTML.
  Takes an `OptionsElements` bundle so it stays testable without a real DOM.
- **`OptionsElements`** — the elements the controller drives (page root plus the theme and
  default-view selects).

## Usage guidance

Construct `OptionsController` at the options composition root with the shared settings store, the ADO
tab reader, the elements, and the page's `report` error sink (see `src/options/index.ts`).
