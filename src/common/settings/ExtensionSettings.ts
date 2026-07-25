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

  /**
   * How many sprints before the current one the sprint picker offers. Clamped to `0..6`; `0` means
   * only the current and future sprints are shown.
   */
  pastSprintsCount: number;

  /** Area paths the user has pinned, each with a short label. Empty until the user adds one. */
  areaPaths: AreaPath[];

  /**
   * The board columns (the team's own "application states") that form the header of the work-item
   * mapping table. The set and order are fixed (`BOARD_COLUMN_COUNT` columns) and shared by every
   * work item type; only each column's *title* is user-editable. The first column is the fallback
   * bucket for any ADO state a type does not explicitly map.
   */
  boardColumns: string[];

  /**
   * The work item types the team uses, each mapping its Azure DevOps states onto the board columns.
   * Empty until the user adds one. **Order is significant:** the array runs from the top-most parent
   * type to its children (e.g. Epic → Feature → User Story → Task), so it encodes the team's work
   * item hierarchy. The order is user-controlled (drag-to-reorder in the options table) and is
   * preserved through save, export, and import.
   */
  workItemTypes: WorkItemType[];

  /**
   * The Azure DevOps *tag* and *comment* token the team uses to signal each recognized condition
   * (blocked internally, blocked by another team, an interrupt, or waiting). Every team keeps its
   * own tag/comment vocabulary, so both tokens are configurable per condition; a blank token means
   * the team does not use that signal for that condition.
   */
  markerTags: WorkItemMarkerTags;
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
 *
 * Types are stored in a deliberate order — parent before child (Epic → Feature → User Story → Task)
 * — so the surrounding `workItemTypes` array position carries meaning; never sort or dedupe it in a
 * way that loses that order.
 */
export interface WorkItemType {
  name: string;
  /** The ADO type color as a hex string without a leading `#` (e.g. `CC293D`). */
  color: string;
  /** The ADO icon URL for the type (already colored via its query string). */
  icon: string;
  columns: WorkItemColumn[];
  /**
   * The ADO date field this type surfaces as its "ETA" (e.g. `Microsoft.VSTS.Scheduling.TargetDate`),
   * or absent when the user has not set one. Configured per type — there is no global default — so a
   * team that tracks ETA in different fields per type is honored.
   */
  etaField?: string;
}

/**
 * The conditions AwesomeADO recognizes on a work item. Each is marked on the item by a configurable
 * Azure DevOps *tag* and echoed in the item's *comments* by a configurable token, so a team can keep
 * using whatever tag/comment vocabulary it already has.
 */
export type WorkItemMarker = "blocked" | "blockedByOtherTeam" | "interrupt" | "waiting";

/** The Azure DevOps tag and the comment token configured for one {@link WorkItemMarker}. */
export interface MarkerTags {
  /** The ADO work-item *tag* that marks an item in this condition; blank means the team omits it. */
  tag: string;
  /** The token written into an item *comment* to signal this condition; blank means the team omits it. */
  commentTag: string;
}

/** The tag/comment configuration for every {@link WorkItemMarker}, keyed by marker. */
export type WorkItemMarkerTags = Record<WorkItemMarker, MarkerTags>;

/**
 * The markers in presentation order, each with the label the options UI shows. This ordered list is
 * the single source of truth for iterating markers (both the normalizer and the options UI read it),
 * so a new marker is added in exactly one place.
 */
export const WORK_ITEM_MARKERS: readonly {
  readonly key: WorkItemMarker;
  readonly label: string;
}[] = [
  { key: "blocked", label: "Blocked (internal)" },
  { key: "blockedByOtherTeam", label: "Blocked by another team" },
  { key: "interrupt", label: "Interrupt" },
  { key: "waiting", label: "Waiting" },
];

/**
 * The tag/comment tokens a fresh install starts from — the vocabulary most teams already use — so
 * the options page opens with sensible values instead of eight empty boxes. Interrupt has no
 * conventional comment token, so it seeds blank.
 */
export const DEFAULT_MARKER_TAGS: WorkItemMarkerTags = {
  blocked: { tag: "Blocked", commentTag: "[BLOCKED]" },
  blockedByOtherTeam: { tag: "Blocked by another team", commentTag: "[ACCEPTED]" },
  interrupt: { tag: "Interrupt", commentTag: "" },
  waiting: { tag: "Waiting", commentTag: "[WAITING]" },
};

/** Allowed theme values, in the order they are offered to the user. */
export const THEMES: readonly Theme[] = ["auto", "light", "dark", "blue"];

/** Allowed default-view values. */
export const DEFAULT_VIEWS: readonly DefaultView[] = ["original", "enhanced"];

/**
 * The fixed board columns every board has, in order. Users can rename any column's title but cannot
 * add or remove columns, so this list is both the seed for a fresh install and the canonical count
 * and order the normalizer coerces every stored value back to.
 */
export const DEFAULT_BOARD_COLUMNS: readonly string[] = [
  "In Queue",
  "In Progress",
  "Waiting",
  "Done",
  "Removed",
];

/** The fixed number of board columns; every normalized `boardColumns` array has exactly this length. */
export const BOARD_COLUMN_COUNT = DEFAULT_BOARD_COLUMNS.length;

/** Inclusive bounds for `futureSprintsCount`; both the UI and the normalizer clamp to this range. */
export const MIN_FUTURE_SPRINTS = 1;
export const MAX_FUTURE_SPRINTS = 12;
const DEFAULT_FUTURE_SPRINTS = 6;

/** Inclusive bounds for `pastSprintsCount`; `0` (the default) offers no sprints before the current. */
export const MIN_PAST_SPRINTS = 0;
export const MAX_PAST_SPRINTS = 6;
const DEFAULT_PAST_SPRINTS = 0;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: "auto",
  defaultView: "enhanced",
  currentTeam: null,
  futureSprintsCount: DEFAULT_FUTURE_SPRINTS,
  pastSprintsCount: DEFAULT_PAST_SPRINTS,
  areaPaths: [],
  boardColumns: [...DEFAULT_BOARD_COLUMNS],
  workItemTypes: [],
  markerTags: normalizeMarkerTags(undefined),
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

/** Clamp an arbitrary stored value to a whole number within `[min, max]`, or `fallback` if unusable. */
function clampSprintCount(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

/** Clamp an arbitrary stored value to a whole number of future sprints within the allowed range. */
export function normalizeFutureSprintsCount(raw: unknown): number {
  return clampSprintCount(raw, MIN_FUTURE_SPRINTS, MAX_FUTURE_SPRINTS, DEFAULT_FUTURE_SPRINTS);
}

/** Clamp an arbitrary stored value to a whole number of past sprints within the allowed range. */
export function normalizePastSprintsCount(raw: unknown): number {
  return clampSprintCount(raw, MIN_PAST_SPRINTS, MAX_PAST_SPRINTS, DEFAULT_PAST_SPRINTS);
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
  const candidate = raw as {
    name?: unknown;
    color?: unknown;
    icon?: unknown;
    columns?: unknown;
    etaField?: unknown;
  };
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
  const type: WorkItemType = { name, color, icon, columns };
  // The ETA field is optional and per-type, so store it only when set; a blank never bloats the map
  // (mirrors how bindings omit an absent name/active).
  const etaField = typeof candidate.etaField === "string" ? candidate.etaField.trim() : "";
  if (etaField.length > 0) {
    type.etaField = etaField;
  }
  return type;
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
 * Normalize one marker's stored entry: trim both tokens. A present-but-blank entry is honored (the
 * user deliberately cleared it); a wholly absent entry seeds that marker's default so a first run
 * starts from the team's most common vocabulary rather than empty boxes.
 */
function normalizeMarkerEntry(raw: unknown, fallback: MarkerTags): MarkerTags {
  if (typeof raw !== "object" || raw === null) {
    return { ...fallback };
  }
  const candidate = raw as Partial<Record<keyof MarkerTags, unknown>>;
  return {
    tag: typeof candidate.tag === "string" ? candidate.tag.trim() : "",
    commentTag: typeof candidate.commentTag === "string" ? candidate.commentTag.trim() : "",
  };
}

/**
 * Reconcile a stored marker-tags value to an entry for every marker. A never-set value seeds the
 * full defaults; a partial object seeds only its missing markers, so a user who deliberately blanks
 * a marker keeps it blank instead of having the default reinstated on every read.
 */
export function normalizeMarkerTags(raw: unknown): WorkItemMarkerTags {
  const candidate = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<
    Record<WorkItemMarker, unknown>
  >;
  const result = {} as WorkItemMarkerTags;
  for (const { key } of WORK_ITEM_MARKERS) {
    result[key] = normalizeMarkerEntry(candidate[key], DEFAULT_MARKER_TAGS[key]);
  }
  return result;
}

/**
 * Reconcile a stored board-column list to the fixed set of positions the board supports.
 *
 * The board's columns are a product invariant: a fixed count and order, with only each column's
 * *title* user-editable. Storage can still hold anything (first run, an older build that allowed
 * add/remove, or a value synced from a different version), so this positionally coerces to exactly
 * `BOARD_COLUMN_COUNT` entries — keeping the user's renamed title at each position when one is stored
 * and non-blank, and otherwise falling back to that position's default title. Extra entries are
 * dropped and missing ones filled, so the count is always fixed while renames survive. A title that
 * collides case-insensitively with an earlier position falls back to that position's default so
 * every column stays uniquely identifiable.
 */
export function normalizeBoardColumns(raw: unknown): string[] {
  const stored = Array.isArray(raw) ? raw : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < BOARD_COLUMN_COUNT; index += 1) {
    const value = stored[index];
    const trimmed = typeof value === "string" ? value.trim() : "";
    let name = trimmed.length > 0 ? trimmed : DEFAULT_BOARD_COLUMNS[index]!;
    if (seen.has(name.toLowerCase())) {
      name = DEFAULT_BOARD_COLUMNS[index]!;
    }
    result.push(name);
    seen.add(name.toLowerCase());
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
    return {
      ...DEFAULT_SETTINGS,
      areaPaths: [],
      boardColumns: [...DEFAULT_BOARD_COLUMNS],
      markerTags: normalizeMarkerTags(undefined),
    };
  }
  const candidate = raw as Partial<Record<keyof ExtensionSettings, unknown>>;
  return {
    theme: isTheme(candidate.theme) ? candidate.theme : DEFAULT_SETTINGS.theme,
    defaultView: isDefaultView(candidate.defaultView)
      ? candidate.defaultView
      : DEFAULT_SETTINGS.defaultView,
    currentTeam: normalizeTeamRef(candidate.currentTeam),
    futureSprintsCount: normalizeFutureSprintsCount(candidate.futureSprintsCount),
    pastSprintsCount: normalizePastSprintsCount(candidate.pastSprintsCount),
    areaPaths: normalizeAreaPaths(candidate.areaPaths),
    // The board columns are a fixed set, so any stored value (including a never-set key) is coerced
    // back to exactly `BOARD_COLUMN_COUNT` positions, preserving each column's user-edited title.
    boardColumns: normalizeBoardColumns(candidate.boardColumns),
    workItemTypes: normalizeWorkItemTypes(candidate.workItemTypes),
    markerTags: normalizeMarkerTags(candidate.markerTags),
  };
}

/**
 * Whether the Azure DevOps settings are complete enough for the extension to enhance a query.
 *
 * The enhanced view depends on a fully mapped board, so every one of these must hold: a current
 * team, at least one pinned area path, and at least one work item type that maps at least one ADO
 * state. (The board columns are a fixed, always-present set, so they need no separate check.) Shared
 * by the content script (which otherwise leaves ADO's own view in place) and the options page (which
 * warns when a binding exists but this returns false).
 */
export function isAdoConfigured(settings: ExtensionSettings): boolean {
  return (
    settings.currentTeam !== null &&
    settings.areaPaths.length > 0 &&
    settings.workItemTypes.length > 0 &&
    settings.workItemTypes.every((type) => type.columns.some((column) => column.states.length > 0))
  );
}
