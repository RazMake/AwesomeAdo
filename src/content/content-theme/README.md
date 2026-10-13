# src/content/content-theme

Applies the selected AwesomeADO theme to UI the content script mounts into the Azure DevOps page.

## Public API

### `applyContentTheme.ts`

- **`applyContentTheme(element, theme, doc)`** — pins the resolved palette's color tokens and
  `color-scheme` onto `element`, so everything inside it uses AwesomeADO's theme rather than the
  tokens it would inherit from ADO. `"auto"` resolves against the theme ADO is painting in `doc`.

## Usage

Call it on the root element of any page-mounted surface (the enhanced-view host, the top-bar menu,
the item collector, the sign-in banner) whenever the element is created or the theme setting
changes.
