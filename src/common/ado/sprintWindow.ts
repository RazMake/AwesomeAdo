import type { TeamIteration } from "./TeamIteration";

/**
 * Where a sprint sits relative to the current one. Kept as a bare literal union (rather than a type
 * imported from the picker) so this data module stays independent of the view controls; it matches
 * `SprintOption.relation` structurally, which is how the whole entry is already consumed.
 */
export type SprintRelation = "past" | "current" | "future";

/** One decorated sprint option in the picker, structurally usable as a `SprintPicker` option. */
export interface SprintWindowEntry {
  /** The iteration GUID used to read this sprint's capacity roster, when ADO supplied it. */
  id?: string;
  /** The iteration path (stable id / option value). */
  path: string;
  /** The raw sprint name — what item iteration paths are matched against when filtering. */
  name: string;
  /** The display label, e.g. `Current - Sprint 5` or `2 sprints ahead - Sprint 7`. */
  label: string;
  /** Where this sprint sits relative to the current one, so the picker can style it. */
  relation: SprintRelation;
}

/** The sprint picker's data: the decorated window plus the name to select by default. */
export interface SprintWindow {
  /** The windowed sprints in chronological (display) order, each with its relative label. */
  entries: SprintWindowEntry[];
  /** The raw name of the anchor (current) sprint, or null when there are no sprints. */
  currentName: string | null;
}

/** How many sprints on each side of the current one the window should include. */
export interface SprintWindowBounds {
  /** Sprints before the current one to include (already clamped by the caller). */
  pastCount: number;
  /** Sprints after the current one to include (already clamped by the caller). */
  futureCount: number;
}

const EMPTY_WINDOW: SprintWindow = { entries: [], currentName: null };

/**
 * Turn a team's full iteration list into the sprint picker's windowed, relatively-labelled options.
 *
 * The window is centred on the current sprint (ADO's `timeFrame === "current"`) and reaches
 * `pastCount` sprints back and `futureCount` sprints forward, clamped to whatever the team actually
 * has. Each entry is labelled by its offset from the current sprint ("Current", "Next", "Previous",
 * "N sprints ahead", "N sprints ago") so the reader never has to know the raw sprint names to orient
 * themselves, and carries the matching `relation` so the picker can color past/future entries.
 *
 * When no iteration is marked `current` (e.g. a gap between sprints, or a team that has not started
 * its cadence), the window anchors on the nearest upcoming sprint — the first `future`, else the
 * last sprint — so the picker still opens on the most relevant option instead of an arbitrary one.
 *
 * `iterations` is assumed to be in chronological order, which is how ADO's team-iterations endpoint
 * returns them (see `parseTeamIterations`).
 */
export function buildSprintWindow(
  iterations: TeamIteration[],
  bounds: SprintWindowBounds,
): SprintWindow {
  if (iterations.length === 0) {
    return EMPTY_WINDOW;
  }

  const anchor = anchorIndex(iterations);
  const start = Math.max(0, anchor - bounds.pastCount);
  const end = Math.min(iterations.length - 1, anchor + bounds.futureCount);

  const entries: SprintWindowEntry[] = [];
  for (let index = start; index <= end; index += 1) {
    const iteration = iterations[index]!;
    entries.push({
      ...(iteration.id === undefined ? {} : { id: iteration.id }),
      path: iteration.path,
      name: iteration.name,
      label: labelFor(iteration.name, index - anchor),
      relation: relationFor(index - anchor),
    });
  }

  return { entries, currentName: iterations[anchor]!.name };
}

/**
 * Pick the index the window centres on: the `current` sprint when ADO marks one, otherwise the first
 * `future` sprint (the nearest upcoming), otherwise the last sprint (everything is in the past).
 */
function anchorIndex(iterations: TeamIteration[]): number {
  const current = iterations.findIndex((iteration) => iteration.timeFrame === "current");
  if (current !== -1) {
    return current;
  }
  const firstFuture = iterations.findIndex((iteration) => iteration.timeFrame === "future");
  return firstFuture !== -1 ? firstFuture : iterations.length - 1;
}

/** Build the relative label for a sprint at `offset` positions from the current one. */
function labelFor(name: string, offset: number): string {
  if (offset === 0) {
    return `Current - ${name}`;
  }
  if (offset === 1) {
    return `Next - ${name}`;
  }
  if (offset === -1) {
    return `Previous - ${name}`;
  }
  if (offset > 1) {
    return `${offset} sprints ahead - ${name}`;
  }
  return `${-offset} sprints ago - ${name}`;
}

/** Bucket a sprint's offset into the past/current/future relation the picker styles by. */
function relationFor(offset: number): SprintRelation {
  if (offset === 0) {
    return "current";
  }
  return offset > 0 ? "future" : "past";
}
