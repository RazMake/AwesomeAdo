# view-common/theme

Shared theme palette for the enhanced-view surface and every control it hosts.

## Why it exists

Each shared view control styles itself from **Azure DevOps' own CSS custom properties** (for example
`var(--text-primary-color, …)`), so out of the box a control follows whatever theme ADO is painting.
This module lets the extension **override that theme** with the one the user picked in Options
(Follow ADO / Light / Dark / Blue) by pinning those same token names on the enhanced-view host — so
one place re-themes _all_ controls at once, and adding a control needs no theming wiring.

## Public API

```ts
import {
  VIEW_THEME_VARIABLES,
  resolveViewThemeColorScheme,
  resolveViewThemePalette,
  type ViewThemePalette,
} from "common/view-common/theme/viewTheme";
```

- `resolveViewThemePalette(theme)` — returns the `ViewThemePalette` (a map of ADO token name → color)
  to pin for a concrete theme, or `null` for `"auto"` (Follow ADO). `null` means **clear** the pinned
  tokens so controls inherit ADO's own theme.
- `VIEW_THEME_VARIABLES` — the token names the palette covers, so a host can clear exactly the tokens
  it may have set when switching back to Follow ADO.
- `resolveViewThemeColorScheme(theme)` — the `color-scheme` (`"dark"` / `"light"`) the theme paints
  in, or `null` for `"auto"` (ask ADO's own page). Widgets the **browser** draws — a date input's
  calendar popup and its indicator glyph, scrollbars — ignore CSS custom properties and read
  `color-scheme`, so the host must declare it alongside the pinned palette.

## Intent

Pin a palette on the host element (never on the document root) so only the extension's own view is
re-themed; Azure DevOps' surviving chrome (breadcrumb bar, left rail) keeps ADO's theme.
