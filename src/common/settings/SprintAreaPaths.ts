/** One sprint's team-shared Lane-filter selection. */
export interface SprintAreaPathSelection {
  areaPaths: string[];
  startDate: string | null;
  finishDate: string | null;
}

/** Selections keyed by the full Azure DevOps iteration path. */
export type SprintAreaPaths = Record<string, SprintAreaPathSelection>;

export interface SprintAreaPathConfiguration {
  sprintAreaPaths: SprintAreaPaths;
}

export interface SprintAreaPathConfigurationService {
  read(): Promise<SprintAreaPathConfiguration>;
  save(sprintAreaPaths: SprintAreaPaths): Promise<boolean>;
}

/** Old completed sprint selections retained in the shared configuration. */
export const RETAINED_PAST_SPRINT_SELECTIONS = 10;

/** Normalize full paths without collapsing differently-cased server values. */
export function normalizeAreaPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const path = typeof value === "string" ? value.trim() : "";
    const key = path.toLocaleLowerCase();
    if (path.length === 0 || seen.has(key)) continue;
    seen.add(key);
    paths.push(path);
  }
  return paths;
}

/** Normalize persisted sprint selections while dropping unusable keys and metadata. */
export function normalizeSprintAreaPaths(raw: unknown): SprintAreaPaths {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: SprintAreaPaths = {};
  for (const [rawPath, rawSelection] of Object.entries(raw)) {
    const path = rawPath.trim();
    if (path.length === 0 || typeof rawSelection !== "object" || rawSelection === null) continue;
    const selection = rawSelection as Partial<Record<keyof SprintAreaPathSelection, unknown>>;
    result[path] = {
      areaPaths: normalizeAreaPaths(selection.areaPaths),
      startDate: normalizeDate(selection.startDate),
      finishDate: normalizeDate(selection.finishDate),
    };
  }
  return result;
}

/** Use a team's saved sprint choice when present; otherwise seed the filter from binding defaults. */
export function selectedAreaPathsForSprint(
  defaults: readonly string[],
  selection: SprintAreaPathSelection | undefined,
): string[] {
  return normalizeAreaPaths(selection?.areaPaths ?? defaults);
}

/** Replace one sprint selection and prune completed history against the injected clock. */
export function withSprintAreaPathSelection(
  selections: SprintAreaPaths,
  sprint: { path: string; startDate?: string; finishDate?: string },
  areaPaths: readonly string[],
  now: Date,
): SprintAreaPaths {
  return pruneSprintAreaPaths(
    {
      ...selections,
      [sprint.path]: {
        areaPaths: normalizeAreaPaths(areaPaths),
        startDate: sprint.startDate ?? null,
        finishDate: sprint.finishDate ?? null,
      },
    },
    now,
  );
}

/** Keep only the newest ten selections whose sprint is known to have finished. */
export function pruneSprintAreaPaths(selections: SprintAreaPaths, now: Date): SprintAreaPaths {
  const normalized = normalizeSprintAreaPaths(selections);
  const past = Object.entries(normalized)
    .filter(([, selection]) => timestamp(selection.finishDate) < now.getTime())
    .sort((left, right) => timestamp(right[1].finishDate) - timestamp(left[1].finishDate));
  const retainedPast = new Set(
    past.slice(0, RETAINED_PAST_SPRINT_SELECTIONS).map(([path]) => path),
  );
  return Object.fromEntries(
    Object.entries(normalized).filter(([path, selection]) => {
      const finishedAt = timestamp(selection.finishDate);
      return !Number.isFinite(finishedAt) || finishedAt >= now.getTime() || retainedPast.has(path);
    }),
  );
}

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function timestamp(value: string | null): number {
  return value === null ? Number.POSITIVE_INFINITY : Date.parse(value);
}
