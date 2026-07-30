import type { ThemeDefinition } from "./ThemeDefinition";

/** AwesomeADO's blue palette. */
export const BLUE_THEME = {
  id: "blue",
  label: "Blue",
  colorScheme: "light",
  colors: {
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
    "--bg": "#eef4fb",
    "--surface": "#ffffff",
    "--surface-hover": "#dcecfb",
    "--text": "#10233b",
    "--text-muted": "#4a5b70",
    "--border": "#cfe0f4",
    "--accent": "#005a9e",
    "--accent-contrast": "#ffffff",
    "--warning": "#8a6d00",
    "--error": "#e06c75",
    "--error-background": "rgb(224 108 117 / 12%)",
    "--shadow": "rgb(0 0 0 / 28%)",
  },
} as const satisfies ThemeDefinition<"blue">;
