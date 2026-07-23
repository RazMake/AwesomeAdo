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

  /**
   * The board columns (the team's own "application states") that form the header of the work-item
   * mapping table. User-defined and shared by every work item type; capped at `MAX_BOARD_COLUMNS`.
   * The first column is the fallback bucket for any ADO state a type does not explicitly map.
   */
  boardColumns: string[];

  /**
   * The work item types the team uses, each mapping its Azure DevOps states onto the board columns.
   * Empty until the user adds one.
   */
  workItemTypes: WorkItemType[];
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

/** One board column within a work item type mapping and the ADO states routed onto it. */
export interface WorkItemColumn {
  column: string;
  /**
   * The ADO state names assigned to this column. Each state appears in at most one column, and the
   * first entry is the column's *primary* state — the value written back to ADO when the user moves
   * an item into this application state.
   */
  states: string[];
}

/**
 * A work item type the team uses. The ADO `name`, `color`, and `icon` URL are stored alongside the
 * state→column mapping so the saved list still renders the type's icon and colored name even when no
 * ADO tab is open to re-list the org's types.
 */
export interface WorkItemType {
  name: string;
  /** The ADO type color as a hex string without a leading `#` (e.g. `CC293D`). */
  color: string;
  /** The ADO icon URL for the type (already colored via its query string). */
  icon: string;
  columns: WorkItemColumn[];
}

/** Allowed theme values, in the order they are offered to the user. */
export const THEMES: readonly Theme[] = ["auto", "light", "dark", "blue"];

/** Allowed default-view values. */
export const DEFAULT_VIEWS: readonly DefaultView[] = ["original", "enhanced"];

/** The most board columns (application states) the mapping table allows. */
export const MAX_BOARD_COLUMNS = 6;

/**
 * The board columns a fresh install starts with. The user can rename, remove, or add columns; these
 * are only the seed so the mapping table is usable immediately.
 */
export const DEFAULT_BOARD_COLUMNS: readonly string[] = [
  "Queue",
  "Active",
  "Waiting",
  "Done",
  "Removed",
];

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
  boardColumns: [...DEFAULT_BOARD_COLUMNS],
  workItemTypes: [],
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
 * Normalize one work item column: keep only a named column with at least one non-empty, de-duplicated
 * state, since a column with no states carries no routing information.
 */
function normalizeWorkItemColumn(raw: unknown, seenStates: Set<string>): WorkItemColumn | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const candidate = raw as { column?: unknown; states?: unknown };
  const column = typeof candidate.column === "string" ? candidate.column.trim() : "";
  if (column.length === 0 || !Array.isArray(candidate.states)) {
    return null;
  }
  const states: string[] = [];
  for (const state of candidate.states) {
    if (typeof state !== "string") {
      continue;
    }
    const trimmed = state.trim();
    // A state routes to at most one column, so ignore a repeat even across a corrupt payload.
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || seenStates.has(key)) {
      continue;
    }
    seenStates.add(key);
    states.push(trimmed);
  }
  return states.length > 0 ? { column, states } : null;
}

function normalizeWorkItemType(raw: unknown): WorkItemType | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const candidate = raw as { name?: unknown; color?: unknown; icon?: unknown; columns?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (name.length === 0) {
    return null;
  }
  const color = typeof candidate.color === "string" ? candidate.color.trim() : "";
  const icon = typeof candidate.icon === "string" ? candidate.icon.trim() : "";
  const columns: WorkItemColumn[] = [];
  // Columns are keyed by their user-typed name (case-insensitive), so the same column can never
  // appear twice even in a corrupt payload.
  const seenColumns = new Set<string>();
  // One shared seen-states set spans every column so the same state can never land in two columns.
  const seenStates = new Set<string>();
  if (Array.isArray(candidate.columns)) {
    for (const rawColumn of candidate.columns) {
      const column = normalizeWorkItemColumn(rawColumn, seenStates);
      const key = column?.column.toLowerCase();
      if (column !== null && key !== undefined && !seenColumns.has(key)) {
        seenColumns.add(key);
        columns.push(column);
      }
    }
  }
  return { name, color, icon, columns };
}

/** Drop unusable entries so a corrupt array can never surface a nameless or duplicated type. */
export function normalizeWorkItemTypes(raw: unknown): WorkItemType[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const result: WorkItemType[] = [];
  for (const entry of raw) {
    const type = normalizeWorkItemType(entry);
    if (type === null) {
      continue;
    }
    const key = type.name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(type);
  }
  return result;
}

/**
 * Drop unusable board-column names so a corrupt array can never surface a blank or duplicated
 * column, and cap the list at `MAX_BOARD_COLUMNS`. Comparison is case-insensitive so `Active` and
 * `active` never both survive.
 */
export function normalizeBoardColumns(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
    if (result.length === MAX_BOARD_COLUMNS) {
      break;
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
    return { ...DEFAULT_SETTINGS, areaPaths: [], boardColumns: [...DEFAULT_BOARD_COLUMNS] };
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
    // A never-set key (first run) seeds the default columns; an explicit array is honored as-is so a
    // user who removed every column keeps an empty header (which reads as "not configured" below).
    boardColumns:
      candidate.boardColumns === undefined
        ? [...DEFAULT_BOARD_COLUMNS]
        : normalizeBoardColumns(candidate.boardColumns),
    workItemTypes: normalizeWorkItemTypes(candidate.workItemTypes),
  };
}

/**
 * Whether the Azure DevOps settings are complete enough for the extension to enhance a query.
 *
 * The enhanced view depends on a fully mapped board, so every one of these must hold: a current
 * team, at least one pinned area path, at least one board column, and at least one work item type
 * that maps at least one ADO state. Shared by the content script (which otherwise leaves ADO's own
 * view in place) and the options page (which warns when a binding exists but this returns false).
 */
export function isAdoConfigured(settings: ExtensionSettings): boolean {
  return (
    settings.currentTeam !== null &&
    settings.areaPaths.length > 0 &&
    settings.boardColumns.length > 0 &&
    settings.workItemTypes.length > 0 &&
    settings.workItemTypes.every((type) => type.columns.some((column) => column.states.length > 0))
  );
}
