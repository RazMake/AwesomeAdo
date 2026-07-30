import type { ThemeDefinition } from "./ThemeDefinition";

/** AwesomeADO's light palette. */
export const LIGHT_THEME = {
  id: "light",
  label: "Light",
  colorScheme: "light",
  colors: {
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
    "--bg": "#f3f3f3",
    "--surface": "#ffffff",
    "--surface-hover": "#f0f6ff",
    "--text": "#1f1f1f",
    "--text-muted": "#616161",
    "--border": "#e0e0e0",
    "--accent": "#0067b8",
    "--accent-contrast": "#ffffff",
    "--warning": "#8a6d00",
    "--error": "#e06c75",
    "--error-background": "rgb(224 108 117 / 12%)",
    "--shadow": "rgb(0 0 0 / 28%)",
  },
} as const satisfies ThemeDefinition<"light">;
