import { ADO_API_VERSION } from "./adoApi";
import { buildTeamScopedApiUrl } from "./fetchAdoMetadata";

const API_VERSION = ADO_API_VERSION;

/**
 * Where an iteration sits relative to today, as Azure DevOps itself classifies it. ADO marks exactly
 * one of a team's iterations `current` (the one whose date range contains today); everything before
 * it is `past` and everything after is `future`. Trusting ADO's own classification is why the sprint
 * picker never has to compare dates to a clock — the "which sprint is now?" decision is already made
 * server-side and travels with each iteration.
 */
export type SprintTimeFrame = "past" | "current" | "future";

/**
 * One of a team's iterations (sprints), reduced to what the sprint picker needs: a stable `path`
 * (the iteration path, used as the option id), the leaf `name` shown to the user, and the
 * `timeFrame` that anchors the "current" sprint.
 */
export interface TeamIteration {
  /** The iteration GUID supplied by ADO. Optional only for defensive/test inputs. */
  id?: string;
  /** The iteration path (stable id, e.g. `Project\Sprint 5`). */
  path: string;
  /** The iteration's display name (the leaf of its path, e.g. `Sprint 5`). */
  name: string;
  timeFrame: SprintTimeFrame;
  /** ISO date bounds supplied by ADO, retained so old sprint configuration can be pruned safely. */
  startDate?: string;
  finishDate?: string;
}

/**
 * Build the team-scoped iterations REST URL for the ADO project named by `href` and the given team,
 * or null when `href` is not a project-scoped ADO location (org-level or folder tabs have no project
 * to read) or `team` is blank. api-version 7.1.
 *
 * The iteration list is team-scoped in Azure DevOps — every team subscribes to its own subset of the
 * project's iterations — so the current team from settings must be part of the URL. URL construction
 * lives here (a pure, chrome-free module) so it stays unit-testable, while the credentialed fetch
 * runs in the ADO page's MAIN world (see `common/browser/fetchAdoIterationsInPage`).
 */
export function buildAdoIterationsUrl(href: string, team: string): string | null {
  return buildTeamScopedApiUrl(href, team, "work/teamsettings/iterations", API_VERSION);
}

/**
 * Parse the raw team-iterations REST body into the normalized `TeamIteration[]`, preserving ADO's
 * chronological order (the endpoint returns iterations oldest-to-newest, which the sprint window
 * relies on to place "past" before "current" before "future").
 *
 * Best-effort: a missing/malformed body or entry is dropped so the picker still renders whatever is
 * valid. The raw body comes from the MAIN-world fetch, which may hand back `null`.
 */
export function parseTeamIterations(body: unknown): TeamIteration[] {
  const value = (body as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(parseTeamIteration).filter((entry): entry is TeamIteration => entry !== null);
}

function parseTeamIteration(entry: unknown): TeamIteration | null {
  if (typeof entry !== "object" || entry === null) return null;
  const { id, name, path, attributes } = entry as {
    id?: unknown;
    name?: unknown;
    path?: unknown;
    attributes?: unknown;
  };
  if (typeof name !== "string" || name.length === 0) return null;
  return {
    ...(typeof id === "string" && id.length > 0 ? { id } : {}),
    // ADO always returns a path, but the name remains a usable option id for a malformed entry.
    path: typeof path === "string" && path.length > 0 ? path : name,
    name,
    timeFrame: readTimeFrame(attributes),
    ...readDates(attributes),
  };
}

function readDates(attributes: unknown): Pick<TeamIteration, "startDate" | "finishDate"> {
  const candidate = attributes as { startDate?: unknown; finishDate?: unknown } | null;
  const startDate = normalizeIterationDate(candidate?.startDate);
  const finishDate = normalizeIterationDate(candidate?.finishDate);
  return {
    ...(startDate === null ? {} : { startDate }),
    ...(finishDate === null ? {} : { finishDate }),
  };
}

function normalizeIterationDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Read the `timeFrame` from an iteration's attributes. Anything other than the three known values
 * (or a missing attributes object) falls back to `past`: an unclassifiable iteration must never be
 * mistaken for the current one, and if no valid `current` is found the window anchors on the first
 * `future` instead (see `buildSprintWindow`).
 */
function readTimeFrame(attributes: unknown): SprintTimeFrame {
  const raw = (attributes as { timeFrame?: unknown } | null)?.timeFrame;
  if (raw === "current" || raw === "future" || raw === "past") {
    return raw;
  }
  return "past";
}
