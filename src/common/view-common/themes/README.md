# `common/view-common/themes`

The shared theme definitions used by both the options page and enhanced views.

## Public API

- `ThemeDefinition.ts` defines the complete CSS-variable contract every theme must satisfy.
- `darkTheme.ts`, `lightTheme.ts`, and `blueTheme.ts` each own one standalone palette. A theme never
  imports or extends another theme.
- `themes.ts` exports `CONCRETE_THEMES`, the derived `ThemeId` / `ThemePreference` types, and
  `resolveTheme(preference, adoTheme)`.

`"auto"` is the stored **Follow Azure DevOps** preference, not a fourth concrete theme. It resolves
only to the registered Dark or Light definition based on ADO's detected color scheme; Blue is always
selected manually.

Every fixed presentation color and semantic color used by Options or an enhanced view belongs to
this contract. Consumers reference roles without literal color fallbacks. Runtime colors supplied by
ADO metadata (such as work-item type colors), generated tag hues, and parsed RGB input remain data;
the theme supplies any fixed colors used to combine with or frame that data.

## Adding A Theme

1. Add one self-contained `<name>Theme.ts` definition satisfying `ThemeDefinition`.
2. Import it and add it to `CONCRETE_THEMES` in `themes.ts`.

The setting type, accepted values, options selector, and both rendering surfaces derive from that
registry. No existing theme file needs to change.

Semantic colors that must retain the same meaning across themes may keep the same value in each
definition. They remain explicit per theme so a future palette can change one without coupling to
another.
