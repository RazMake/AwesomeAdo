import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import { isInAreaPathBranches } from "../../../../common/ado/workItemAreaPaths";
import { parseConsumerProfile } from "../profile/consumerProfile";

/** The value seen most often, the first one seen winning a tie; null when there are none. */
function mostCommon(values: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value !== null && value.length > 0) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [value, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}

/** The type a new child of `parent` defaults to under the configured hierarchy, if any. */
function configuredChildType(
  parent: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): string | null {
  return types.get(parent.type)?.children?.[0] ?? null;
}

/**
 * The type a new consumer is created as: whatever the existing consumers are, so the new one sits
 * beside them in the same query; the configured child type of the grouping item when there are
 * none yet. Null when neither says, which leaves the command disabled rather than guessing.
 */
export function newConsumerType(
  grouping: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): string | null {
  return (
    mostCommon(grouping.children.map((consumer) => consumer.type)) ??
    configuredChildType(grouping, types)
  );
}

/**
 * The type a new request is created as: what this consumer's requests already are, else what any
 * consumer's are, else the configured child type of the consumer.
 */
export function newRequestType(
  grouping: TrackedWorkItem,
  consumer: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): string | null {
  return (
    mostCommon(consumer.children.map((request) => request.type)) ??
    mostCommon(grouping.children.flatMap((other) => other.children.map((item) => item.type))) ??
    configuredChildType(consumer, types)
  );
}

/**
 * Where a new request is filed: the area the requests this board keeps are most often in, so it
 * shows up on the board it was created from rather than vanishing behind the binding's
 * `requestAreaPaths`. Falls back to the first configured branch, then to the consumer's own area.
 */
export function newRequestAreaPath(
  grouping: TrackedWorkItem,
  consumer: TrackedWorkItem,
  configuredAreaPaths: readonly string[],
): string | null {
  const kept = (requests: readonly TrackedWorkItem[]): (string | null)[] =>
    requests
      .filter((request) => isInAreaPathBranches(request.areaPath, configuredAreaPaths))
      .map((request) => request.areaPath);
  return (
    mostCommon(kept(consumer.children)) ??
    mostCommon(kept(grouping.children.flatMap((other) => other.children))) ??
    configuredAreaPaths[0] ??
    consumer.areaPath
  );
}

/**
 * The name the Scenario guidance gives the service consumers call: the last segment of the area
 * path consumers are filed in, which is the team's own service by convention.
 */
export function calledServiceName(grouping: TrackedWorkItem): string {
  const segment = (grouping.areaPath ?? "").split("\\").at(-1)?.trim() ?? "";
  return segment.length > 0 ? segment : "our service";
}

/** The client ids the existing consumers' descriptions already state, lowercased for comparison. */
export function knownClientIds(grouping: TrackedWorkItem): Set<string> {
  return new Set(
    grouping.children
      .map((consumer) => parseConsumerProfile(consumer.description).clientId)
      .filter((id): id is string => id !== null)
      .map((id) => id.toLowerCase()),
  );
}
