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

  /**
   * The ADO team whose sprints (iterations) drive the sprint picker and the "current sprint"
   * default, or null when the user has not chosen one. Stored with both id and display name so the
   * options page can label the saved team even when no ADO tab is open to re-list the org's teams.
   */
  currentTeam: TeamRef | null;

  /** How many sprints past the current one the sprint picker offers. Clamped to `1..12`. */
  futureSprintsCount: number;

  /** Area paths the user has pinned, each with a short label. Empty until the user adds one. */
  areaPaths: AreaPath[];
}

export type Theme = "auto" | "light" | "dark" | "blue";
export type DefaultView = "original" | "enhanced";

/** An ADO team the user selected: its stable id plus the name shown in the picker. */
export interface TeamRef {
  id: string;
  name: string;
}

/** A pinned area path and the label shown for it (defaults to the path's last segment). */
export interface AreaPath {
  path: string;
  label: string;
}

/** Allowed theme values, in the order they are offered to the user. */
export const THEMES: readonly Theme[] = ["auto", "light", "dark", "blue"];

/** Allowed default-view values. */
export const DEFAULT_VIEWS: readonly DefaultView[] = ["original", "enhanced"];

/** Inclusive bounds for `futureSprintsCount`; both the UI and the normalizer clamp to this range. */
export const MIN_FUTURE_SPRINTS = 1;
export const MAX_FUTURE_SPRINTS = 12;
const DEFAULT_FUTURE_SPRINTS = 6;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: "auto",
  defaultView: "enhanced",
  currentTeam: null,
  futureSprintsCount: DEFAULT_FUTURE_SPRINTS,
  areaPaths: [],
};

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

function isDefaultView(value: unknown): value is DefaultView {
  return typeof value === "string" && (DEFAULT_VIEWS as readonly string[]).includes(value);
}

/**
 * The label an area path gets when the user has not typed one: its last `\`-separated segment
 * (e.g. `Project\Area\Team` → `Team`). Shared by the normalizer and the options UI so a stored
 * value and a freshly typed one derive the same default.
 */
export function defaultAreaPathLabel(path: string): string {
  const segments = path.split("\\").filter((segment) => segment.trim().length > 0);
  return segments[segments.length - 1]?.trim() ?? "";
}

function normalizeTeamRef(raw: unknown): TeamRef | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const candidate = raw as Partial<Record<keyof TeamRef, unknown>>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    return null;
  }
  return { id: candidate.id, name: candidate.name };
}

/** Clamp an arbitrary stored value to a whole number of sprints within the allowed range. */
export function normalizeFutureSprintsCount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_FUTURE_SPRINTS;
  }
  const whole = Math.trunc(raw);
  return Math.min(MAX_FUTURE_SPRINTS, Math.max(MIN_FUTURE_SPRINTS, whole));
}

function normalizeAreaPath(raw: unknown): AreaPath | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const candidate = raw as Partial<Record<keyof AreaPath, unknown>>;
  const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
  if (path.length === 0) {
    return null;
  }
  // A stored entry can predate the label field or hold a blank one; fall back to the path's tail so
  // every persisted area path always has something meaningful to show.
  const rawLabel = typeof candidate.label === "string" ? candidate.label.trim() : "";
  return { path, label: rawLabel.length > 0 ? rawLabel : defaultAreaPathLabel(path) };
}

/** Drop unusable entries so a corrupt array can never surface a pathless or duplicated area path. */
export function normalizeAreaPaths(raw: unknown): AreaPath[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const result: AreaPath[] = [];
  for (const entry of raw) {
    const areaPath = normalizeAreaPath(entry);
    if (areaPath !== null && !seen.has(areaPath.path)) {
      seen.add(areaPath.path);
      result.push(areaPath);
    }
  }
  return result;
}

/**
 * Convert an unknown value read from storage into a valid ExtensionSettings.
 *
 * Storage can hold anything (first run = undefined; older builds = partial or removed shapes), so
 * every consumer must go through this single normalizer instead of trusting the raw value.
 */
export function normalizeSettings(raw: unknown): ExtensionSettings {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_SETTINGS, areaPaths: [] };
  }
  const candidate = raw as Partial<Record<keyof ExtensionSettings, unknown>>;
  return {
    theme: isTheme(candidate.theme) ? candidate.theme : DEFAULT_SETTINGS.theme,
    defaultView: isDefaultView(candidate.defaultView)
      ? candidate.defaultView
      : DEFAULT_SETTINGS.defaultView,
    currentTeam: normalizeTeamRef(candidate.currentTeam),
    futureSprintsCount: normalizeFutureSprintsCount(candidate.futureSprintsCount),
    areaPaths: normalizeAreaPaths(candidate.areaPaths),
  };
}
