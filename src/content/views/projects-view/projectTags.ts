import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

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

/** Whether an item carries at least one of the selected tags (an empty selection matches nothing). */
export function carriesAnyTag(item: TrackedWorkItem, selected: ReadonlySet<string>): boolean {
  return item.tags.some((tag) => selected.has(tag.trim().toLowerCase()));
}

/** Add an item and everything beneath it to `into`. */
function addSubtreeIds(item: TrackedWorkItem, into: Set<number>): void {
  into.add(item.id);
  for (const child of item.children) {
    addSubtreeIds(child, into);
  }
}

/**
 * The ids the tag filter keeps: every matching item, the ancestors that lead to it, and everything
 * beneath it.
 *
 * Ancestors are kept because a project whose only tagged work is three levels down still has to be
 * reachable — dropping it would answer "no projects use this tag" when several do. The subtree is
 * kept because the match is a statement about that branch of work, and hiding the untagged detail
 * under it would leave a matching item looking childless.
 */
export function idsKeptByTags(
  roots: readonly TrackedWorkItem[],
  matches: (item: TrackedWorkItem) => boolean,
): ReadonlySet<number> {
  const kept = new Set<number>();
  const visit = (item: TrackedWorkItem, ancestorIds: readonly number[]): void => {
    if (matches(item)) {
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
