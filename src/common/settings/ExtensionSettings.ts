/**
 * The complete set of user-configurable options for the extension.
 *
 * Each field is stored under its own synced key, so new settings can be added later without
 * changing the storage contract or risking an older build clobbering a newer field.
 */
export interface ExtensionSettings {
  /**
   * Which visual theme the extension applies. `auto` follows Azure DevOps' own active theme;
   * the remaining values pin a specific ADO theme regardless of what ADO is using.
   */
  theme: Theme;

  /**
   * Which view the extension shows on an Azure DevOps Query page.
   * `enhanced` lets the extension take over the page; `original` leaves ADO untouched.
   */
  defaultView: DefaultView;
}

export type Theme = "auto" | "light" | "dark" | "blue";
export type DefaultView = "original" | "enhanced";

/** Allowed theme values, in the order they are offered to the user. */
export const THEMES: readonly Theme[] = ["auto", "light", "dark", "blue"];

/** Allowed default-view values. */
export const DEFAULT_VIEWS: readonly DefaultView[] = ["original", "enhanced"];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: "auto",
  defaultView: "enhanced",
};

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

function isDefaultView(value: unknown): value is DefaultView {
  return typeof value === "string" && (DEFAULT_VIEWS as readonly string[]).includes(value);
}

/**
 * Convert an unknown value read from storage into a valid ExtensionSettings.
 *
 * Storage can hold anything (first run = undefined; older builds = partial or removed shapes), so
 * every consumer must go through this single normalizer instead of trusting the raw value.
 */
export function normalizeSettings(raw: unknown): ExtensionSettings {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }
  const candidate = raw as Partial<Record<keyof ExtensionSettings, unknown>>;
  return {
    theme: isTheme(candidate.theme) ? candidate.theme : DEFAULT_SETTINGS.theme,
    defaultView: isDefaultView(candidate.defaultView)
      ? candidate.defaultView
      : DEFAULT_SETTINGS.defaultView,
  };
}
