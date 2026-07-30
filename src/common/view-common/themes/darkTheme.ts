import type { ThemeDefinition } from "./ThemeDefinition";

/** AwesomeADO's dark palette. */
export const DARK_THEME = {
  id: "dark",
  label: "Dark",
  colorScheme: "dark",
  colors: {
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
    "--bg": "#1b1b1c",
    "--surface": "#252526",
    "--surface-hover": "#2d2d2f",
    "--text": "#e6e6e6",
    "--text-muted": "#9d9d9d",
    "--border": "#3a3a3c",
    "--accent": "#3794ff",
    "--accent-contrast": "#ffffff",
    "--warning": "#e5c07b",
    "--error": "#e06c75",
    "--error-background": "rgb(224 108 117 / 12%)",
    "--shadow": "rgb(0 0 0 / 28%)",
  },
} as const satisfies ThemeDefinition<"dark">;
