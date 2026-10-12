import { ADO_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

/**
 * The State changes a work item type's process allows, keyed by the lower-cased FROM state and
 * listing each allowed TO state as Azure DevOps spells it.
 */
export type WorkItemStateTransitions = ReadonlyMap<string, readonly string[]>;

/** Reads one work item type's allowed State changes, or null when they could not be read. */
export interface IWorkItemStateTransitionsReader {
  load(workItemType: string): Promise<WorkItemStateTransitions | null>;
}

function stateKey(state: string): string {
  return state.trim().toLowerCase();
}

/** The work item type URL whose body carries the type's `transitions` map. */
export function buildWorkItemTypeUrl(href: string, workItemType: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null || workItemType.trim().length === 0) return null;
  return `${resolved.base}/${resolved.project}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}?api-version=${ADO_API_VERSION}`;
}

/** Read the `transitions` map of a work item type body, or null when the body carries none. */
export function parseWorkItemStateTransitions(raw: unknown): WorkItemStateTransitions | null {
  const transitions = (raw as { transitions?: unknown } | null)?.transitions;
  if (typeof transitions !== "object" || transitions === null || Array.isArray(transitions)) {
    return null;
  }
  const parsed = new Map<string, string[]>();
  for (const [from, targets] of Object.entries(transitions as Record<string, unknown>)) {
    // The "" key lists the states an item may be CREATED in; an existing item never starts there.
    if (stateKey(from).length === 0 || !Array.isArray(targets)) continue;
    const to = targets
      .map((target) => (target as { to?: unknown } | null)?.to)
      .filter((state): state is string => typeof state === "string" && state.trim().length > 0);
    parsed.set(stateKey(from), [...(parsed.get(stateKey(from)) ?? []), ...to]);
  }
  return parsed.size > 0 ? parsed : null;
}

/**
 * The States to write, in order, to move an item from `from` to `to` — the intermediary States
 * followed by `to` itself — or null when the process offers no path.
 *
 * A breadth-first search yields the fewest writes, and ADO's own listing order breaks ties so the
 * same change always takes the same route. An item already in `to` needs no write at all.
 */
export function stateTransitionRoute(
  transitions: WorkItemStateTransitions,
  from: string,
  to: string,
): string[] | null {
  const target = stateKey(to);
  if (stateKey(from) === target) return [];
  const previous = new Map<string, { state: string; via: string | null }>([
    [stateKey(from), { state: from, via: null }],
  ]);
  const pending = [stateKey(from)];
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    for (const state of transitions.get(next) ?? []) {
      const key = stateKey(state);
      if (previous.has(key)) continue;
      previous.set(key, { state, via: next });
      if (key === target) return routeTo(previous, key);
      pending.push(key);
    }
  }
  return null;
}

function routeTo(
  previous: ReadonlyMap<string, { state: string; via: string | null }>,
  key: string,
): string[] {
  const route: string[] = [];
  for (
    let step = previous.get(key);
    step !== undefined && step.via !== null;
    step = previous.get(step.via)
  ) {
    route.unshift(step.state);
  }
  return route;
}
