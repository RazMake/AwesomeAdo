import type { ThemeDefinition, ThemeColorScheme } from "./ThemeDefinition";
import { BLUE_THEME } from "./blueTheme";
import { DARK_THEME } from "./darkTheme";
import { LIGHT_THEME } from "./lightTheme";

export const CONCRETE_THEMES = [DARK_THEME, LIGHT_THEME, BLUE_THEME] as const;
export type ThemeId = (typeof CONCRETE_THEMES)[number]["id"];
export type ThemePreference = "auto" | ThemeId;

export const THEME_IDS: readonly ThemeId[] = CONCRETE_THEMES.map((theme) => theme.id);
export const THEME_PREFERENCES: readonly ThemePreference[] = ["auto", ...THEME_IDS];

const THEMES_BY_ID: ReadonlyMap<ThemeId, ThemeDefinition<ThemeId>> = new Map(
  CONCRETE_THEMES.map((theme) => [theme.id, theme]),
);

/** Return the complete definition registered for a concrete theme. */
export function getTheme(themeId: ThemeId): ThemeDefinition<ThemeId> {
  const theme = THEMES_BY_ID.get(themeId);
  if (!theme) {
    throw new Error(`Theme "${themeId}" is not registered.`);
  }
  return theme;
}

/** Resolve Follow ADO to Dark or Light; concrete themes always remain explicitly selected. */
export function resolveTheme(
  preference: ThemePreference,
  adoTheme: ThemeColorScheme | null,
): ThemeDefinition<ThemeId> {
  return getTheme(preference === "auto" ? (adoTheme ?? "dark") : preference);
}
