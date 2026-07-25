import type { Theme } from "../../settings/ExtensionSettings";

/**
 * The Azure DevOps CSS custom-property names every shared view control already reads (with a literal
 * fallback) to stay theme-aware. Pinning these on the enhanced-view host is what lets one place
 * re-theme *all* controls at once: a control's `var(--text-primary-color, …)` resolves to the pinned
 * value when the user chose a concrete theme, and to ADO's own token when they chose "Follow ADO".
 * Keeping the list here (rather than per control) is why adding a control needs no theming wiring.
 */
export const VIEW_THEME_VARIABLES = [
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
] as const;

/** One of the ADO token names the extension can pin to a concrete theme. */
export type ViewThemeVariable = (typeof VIEW_THEME_VARIABLES)[number];

/** A full mapping of every pinned token to its value for one concrete theme. */
export type ViewThemePalette = Readonly<Record<ViewThemeVariable, string>>;

// Values mirror the options page's own light/dark/blue palettes but are expressed under ADO's token
// names so the controls (which speak ADO tokens) pick them up unchanged. Neutrals are alpha overlays
// so surface tints read on whatever background each theme paints, matching ADO's own neutral scheme.
const DARK: ViewThemePalette = {
  "--background-color": "#1f1f1f",
  "--callout-background-color": "#2b2b2b",
  "--text-primary-color": "#e6e6e6",
  "--text-secondary-color": "#a0a0a0",
  "--communication-background": "#2899f5",
  "--text-on-communication-background": "#ffffff",
  "--palette-neutral-4": "rgba(255,255,255,0.06)",
  "--palette-neutral-8": "rgba(255,255,255,0.1)",
  "--palette-neutral-20": "rgba(255,255,255,0.24)",
  "--component-menu-separator-color": "rgba(255,255,255,0.18)",
};

const LIGHT: ViewThemePalette = {
  "--background-color": "#ffffff",
  "--callout-background-color": "#ffffff",
  "--text-primary-color": "#1f1f1f",
  "--text-secondary-color": "#605e5c",
  "--communication-background": "#0078d4",
  "--text-on-communication-background": "#ffffff",
  "--palette-neutral-4": "rgba(0,0,0,0.04)",
  "--palette-neutral-8": "rgba(0,0,0,0.08)",
  "--palette-neutral-20": "rgba(0,0,0,0.2)",
  "--component-menu-separator-color": "rgba(0,0,0,0.15)",
};

const BLUE: ViewThemePalette = {
  "--background-color": "#eef4fb",
  "--callout-background-color": "#ffffff",
  "--text-primary-color": "#10233b",
  "--text-secondary-color": "#40536b",
  "--communication-background": "#005a9e",
  "--text-on-communication-background": "#ffffff",
  "--palette-neutral-4": "rgba(16,35,59,0.04)",
  "--palette-neutral-8": "rgba(16,35,59,0.08)",
  "--palette-neutral-20": "rgba(16,35,59,0.2)",
  "--component-menu-separator-color": "rgba(16,35,59,0.16)",
};

/**
 * The palette to pin for a chosen theme, or `null` for "auto" (Follow ADO). Returning `null` is a
 * deliberate signal to *clear* any pinned tokens so the control inherits Azure DevOps' own theme,
 * rather than an extension-forced one — that is what "Follow ADO" means.
 */
export function resolveViewThemePalette(theme: Theme): ViewThemePalette | null {
  switch (theme) {
    case "light":
      return LIGHT;
    case "dark":
      return DARK;
    case "blue":
      return BLUE;
    default:
      return null;
  }
}
