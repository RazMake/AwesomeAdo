/** CSS variables supplied by every concrete AwesomeADO theme. */
export const THEME_COLOR_VARIABLES = [
  "--background-color",
  "--callout-background-color",
  "--text-primary-color",
  "--text-secondary-color",
  "--communication-background",
  "--text-on-communication-background",
  "--palette-neutral-4",
  "--palette-neutral-8",
  "--palette-neutral-20",
  "--component-menu-separator-color",
  "--bg",
  "--surface",
  "--surface-hover",
  "--text",
  "--text-muted",
  "--border",
  "--accent",
  "--accent-contrast",
  "--warning",
  "--error",
  "--error-background",
  "--shadow",
] as const;

export type ThemeColorVariable = (typeof THEME_COLOR_VARIABLES)[number];
export type ThemeColorScheme = "dark" | "light";
export type ThemeColors = Readonly<Record<ThemeColorVariable, string>>;

/** A complete, independently selectable visual theme. */
export interface ThemeDefinition<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly colorScheme: ThemeColorScheme;
  readonly colors: ThemeColors;
}
