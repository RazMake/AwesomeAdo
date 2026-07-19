import type { AdoTheme } from "../common/navigation/AdoContext";
import type { Theme } from "../common/settings/ExtensionSettings";

/** The concrete themes the options page can actually paint (never "auto"). */
export type ConcreteTheme = "light" | "dark" | "blue";

/**
 * Turn the stored theme preference into the theme the page should render.
 *
 * "auto" follows Azure DevOps' detected theme; when ADO's theme is unknown (no query tab open, or
 * it could not be probed) we fall back to dark so the page still looks intentional.
 */
export function resolveTheme(setting: Theme, adoTheme: AdoTheme | null): ConcreteTheme {
  if (setting === "auto") {
    return adoTheme ?? "dark";
  }
  return setting;
}
