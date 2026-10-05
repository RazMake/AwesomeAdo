import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

/**
 * The condition a header's tag filter currently expresses, all keys lower-cased.
 *
 * Lower-cased because Azure DevOps treats tags case-insensitively while storing whichever spelling
 * arrived first: comparing on the spelling would split one tag into two half-answers.
 */
export interface TagCondition {
  /** Tags an item must carry. */
  required: ReadonlySet<string>;
  /** Tags an item must NOT carry. */
  excluded: ReadonlySet<string>;
  /** Whether EVERY required tag must be present, rather than any one of them. */
  matchAll: boolean;
}

/** A condition that narrows nothing. */
export function emptyTagCondition(): TagCondition {
  return { required: new Set(), excluded: new Set(), matchAll: false };
}

/** Whether the condition narrows anything at all. */
export function isEmptyTagCondition(condition: TagCondition): boolean {
  return condition.required.size === 0 && condition.excluded.size === 0;
}

/** The item's tags, trimmed, blank-free, and lower-cased for comparison. */
export function tagKeys(item: TrackedWorkItem): string[] {
  return item.tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
}

/**
 * Every distinct Azure DevOps tag worn by any of `items`, minus `excluded`, ordered
 * case-insensitively.
 */
export function tagsInUse(
  items: readonly TrackedWorkItem[],
  excluded: ReadonlySet<string> = new Set(),
): string[] {
  const byLowerCase = new Map<string, string>();
  for (const item of items) {
    for (const raw of item.tags) {
      const tag = raw.trim();
      const key = tag.toLowerCase();
      // First spelling wins: ADO tags are case-insensitive, so "Security" and "security" are one tag
      // and offering both would split a single filter into two half-answers.
      if (tag.length > 0 && !excluded.has(key) && !byLowerCase.has(key)) byLowerCase.set(key, tag);
    }
  }
  return [...byLowerCase.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

/** Whether an item carries every tag the condition requires, or any one of them. */
export function carriesRequiredTags(item: TrackedWorkItem, condition: TagCondition): boolean {
  const worn = new Set(tagKeys(item));
  return condition.matchAll
    ? [...condition.required].every((tag) => worn.has(tag))
    : [...condition.required].some((tag) => worn.has(tag));
}

/** Whether an item carries any tag the condition rules out. */
export function carriesExcludedTag(item: TrackedWorkItem, condition: TagCondition): boolean {
  return tagKeys(item).some((tag) => condition.excluded.has(tag));
}

/**
 * Whether the item's OWN tags satisfy the condition: no excluded tag, and the required ones (when
 * any are required). For flat lists, where there is no subtree for a match to climb out of.
 */
export function matchesTagCondition(item: TrackedWorkItem, condition: TagCondition): boolean {
  if (carriesExcludedTag(item, condition)) return false;
  return condition.required.size === 0 || carriesRequiredTags(item, condition);
}

/** The condition in one log-readable phrase, so a diagnostics reader can reconstruct the board. */
export function describeTagCondition(condition: TagCondition): string {
  if (isEmptyTagCondition(condition)) return "none";
  const parts: string[] = [];
  if (condition.required.size > 0) {
    parts.push(
      `${condition.matchAll ? "all of" : "any of"} [${[...condition.required].join(", ")}]`,
    );
  }
  if (condition.excluded.size > 0) {
    parts.push(`none of [${[...condition.excluded].join(", ")}]`);
  }
  return parts.join(" and ");
}

/** A condition pruned to the tags still on offer, plus the keys it lost. */
export interface PrunedTagCondition {
  condition: TagCondition;
  dropped: string[];
}

/**
 * Drop condition tags no longer offered.
 *
 * The vocabulary moves under the reader: a refresh can return re-tagged items. Keeping a stale tag
 * would narrow the board by something the filter — which only offers tags that exist — shows as
 * unselected, leaving a short list with no visible cause. Returns the same condition object when
 * nothing was dropped, so a caller can skip logging and URL writes.
 */
export function pruneTagCondition(
  condition: TagCondition,
  available: readonly string[],
): PrunedTagCondition {
  const offered = new Set(available.map((tag) => tag.toLowerCase()));
  const stale = (tags: ReadonlySet<string>): string[] =>
    [...tags].filter((tag) => !offered.has(tag));
  const dropped = [...stale(condition.required), ...stale(condition.excluded)];
  if (dropped.length === 0) return { condition, dropped };
  return {
    condition: {
      required: new Set([...condition.required].filter((tag) => offered.has(tag))),
      excluded: new Set([...condition.excluded].filter((tag) => offered.has(tag))),
      matchAll: condition.matchAll,
    },
    dropped,
  };
}
