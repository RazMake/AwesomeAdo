import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

/**
 * The condition the header's tag filter currently expresses, all keys lower-cased.
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

/** Whether the condition narrows anything at all. */
export function isEmptyTagCondition(condition: TagCondition): boolean {
  return condition.required.size === 0 && condition.excluded.size === 0;
}

/** The item's tags, trimmed, blank-free, and lower-cased for comparison. */
function tagKeys(item: TrackedWorkItem): string[] {
  return item.tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
}

/**
 * The tags EVERY project carries — the query's own condition rather than anything about a project.
 *
 * A query that selects its projects by a tag stamps that tag on every row it returns, so showing it
 * says nothing and offering it as a filter narrows nothing. Measured over the projects (the query's
 * top-level results) because that is what the condition selected; a descendant inherits nothing.
 *
 * Needs at least two projects: with one, there is no way to tell the query's condition apart from
 * that project's own tags, and guessing would hide the only tags there are.
 */
export function queryWideTags(roots: readonly TrackedWorkItem[]): ReadonlySet<string> {
  if (roots.length < 2) return new Set();
  const [first, ...rest] = roots;
  const shared = new Set(tagKeys(first!));
  for (const root of rest) {
    const keys = new Set(tagKeys(root));
    for (const key of shared) {
      if (!keys.has(key)) shared.delete(key);
    }
  }
  return shared;
}

/**
 * The query's own condition tags, spelled as the projects actually wear them.
 *
 * `queryWideTags` answers in lower case because it exists to COMPARE, but creating a project has to
 * WRITE the tag — and Azure DevOps stores the first spelling it is given, so writing the lower-cased
 * form would leave the catalog carrying two visibly different spellings of one tag.
 */
export function queryWideTagNames(roots: readonly TrackedWorkItem[]): string[] {
  const shared = queryWideTags(roots);
  const first = roots[0];
  if (shared.size === 0 || first === undefined) return [];
  return first.tags.map((tag) => tag.trim()).filter((tag) => shared.has(tag.toLowerCase()));
}

/**
 * Every distinct Azure DevOps tag worn by any loaded item, minus `excluded`, ordered
 * case-insensitively.
 *
 * Collected across the WHOLE tree rather than the top level: a tag applied to a story nobody has
 * expanded yet is exactly the tag a reader wants to narrow by, and a picker that only offered the
 * project rows' own tags would silently hide it.
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
function carriesRequiredTags(item: TrackedWorkItem, condition: TagCondition): boolean {
  const worn = new Set(tagKeys(item));
  return condition.matchAll
    ? [...condition.required].every((tag) => worn.has(tag))
    : [...condition.required].some((tag) => worn.has(tag));
}

/** Whether an item carries any tag the condition rules out. */
function carriesExcludedTag(item: TrackedWorkItem, condition: TagCondition): boolean {
  return tagKeys(item).some((tag) => condition.excluded.has(tag));
}

/** Add an item and everything beneath it to `into`. */
function addSubtreeIds(item: TrackedWorkItem, into: Set<number>): void {
  into.add(item.id);
  for (const child of item.children) {
    addSubtreeIds(child, into);
  }
}

/**
 * The branches an excluded tag leaves standing.
 *
 * The exclusion is read the way the reader asked it — "projects that do not CONTAIN this tag" — so
 * it climbs as well as descends: an item is ruled out when it or anything beneath it wears the tag,
 * and it takes its whole subtree with it. Matching only the wearer would answer "hide the projects
 * using X" by showing every one of them minus a row somewhere in the middle.
 */
function idsSurvivingExclusions(
  roots: readonly TrackedWorkItem[],
  condition: TagCondition,
): Set<number> {
  const ruledOut = new Set<number>();
  const mark = (item: TrackedWorkItem): boolean => {
    // Every child is visited before the verdict: a clean branch beside a ruled-out one still has to
    // be walked, or its own descendants would never be judged.
    const below = item.children.map(mark).includes(true);
    if (below || carriesExcludedTag(item, condition)) ruledOut.add(item.id);
    return ruledOut.has(item.id);
  };
  const surviving = new Set<number>();
  for (const root of roots) mark(root);
  for (const root of roots) {
    // Anything left is clean all the way down, so the subtree can be taken whole.
    if (!ruledOut.has(root.id)) addSubtreeIds(root, surviving);
  }
  return surviving;
}

/**
 * The ids the tag condition keeps, or `null` when it narrows nothing and every item is kept.
 *
 * Two stages, because "must not have" and "must have" are different questions about the tree.
 * Exclusions PRUNE whole projects (see `idsSurvivingExclusions`). Requirements NARROW what is left
 * to the branches that satisfy them, keeping the ancestors that lead to a match — a project whose
 * only matching work is three levels down still has to be reachable, or the board would answer "no
 * projects use this tag" when several do — and the subtree beneath it, because the match is a
 * statement about that branch and hiding the untagged detail under it would leave a matching item
 * looking childless.
 */
export function idsKeptByTagCondition(
  roots: readonly TrackedWorkItem[],
  condition: TagCondition,
): ReadonlySet<number> | null {
  if (isEmptyTagCondition(condition)) return null;
  const surviving = idsSurvivingExclusions(roots, condition);
  if (condition.required.size === 0) return surviving;

  const kept = new Set<number>();
  const visit = (item: TrackedWorkItem, ancestorIds: readonly number[]): void => {
    if (!surviving.has(item.id)) return;
    if (carriesRequiredTags(item, condition)) {
      for (const id of ancestorIds) kept.add(id);
      addSubtreeIds(item, kept);
    }
    const chain = [...ancestorIds, item.id];
    for (const child of item.children) {
      visit(child, chain);
    }
  };
  for (const root of roots) {
    visit(root, []);
  }
  return kept;
}
