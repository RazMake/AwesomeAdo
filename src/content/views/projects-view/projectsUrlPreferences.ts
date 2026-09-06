import type { TagCondition } from "./projectTags";

/** The tags a link requires, in the order they were listed. */
const REQUIRED_TAGS_PARAM = "tags";

/** The tags a link rules out — the `not` toggle each filter row carries. */
const EXCLUDED_TAGS_PARAM = "notTags";

/** Whether every required tag must be present, rather than any one of them. */
const MATCH_PARAM = "tagMatch";

/**
 * Safe as a list separator: Azure DevOps rejects a comma inside a tag name, so no tag can be split
 * in half by one.
 */
const TAG_SEPARATOR = ",";

const MATCH_ALL_VALUE = "all";

/** One parameter's tags, trimmed, blank-free, and lower-cased to match how a condition is keyed. */
function readTags(parameters: URLSearchParams, name: string): Set<string> {
  return new Set(
    parameters
      .getAll(name)
      .flatMap((value) => value.split(TAG_SEPARATOR))
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0),
  );
}

/**
 * Read the tag condition a catalog link asks the board to open on.
 *
 * Takes the search string rather than the whole URL so nothing here can throw: a filter the board
 * merely starts from must never be able to break the page it opens. Anything unrecognised simply
 * narrows nothing, which is the same board the reader gets with no link at all.
 */
export function readProjectsUrlTagCondition(search: string): TagCondition {
  const parameters = new URLSearchParams(search);
  return {
    required: readTags(parameters, REQUIRED_TAGS_PARAM),
    excluded: readTags(parameters, EXCLUDED_TAGS_PARAM),
    matchAll: parameters.get(MATCH_PARAM)?.trim().toLowerCase() === MATCH_ALL_VALUE,
  };
}

function applyParameter(parameters: URLSearchParams, name: string, value: string): void {
  if (value.length === 0) parameters.delete(name);
  else parameters.set(name, value);
}

/**
 * Rewrite a query string so it carries exactly this tag condition, leaving every other parameter
 * Azure DevOps put there untouched.
 *
 * The tags are written as the condition keys them — lower case — because Azure DevOps matches tags
 * case-insensitively, so a link round-trips to the same board whichever spelling the projects wear.
 * `tagMatch` is written only when something is actually required: "all of nothing" combines nothing,
 * and carrying it would put a parameter on the link that changes no board.
 */
export function projectsSearchWithTagCondition(search: string, condition: TagCondition): string {
  const parameters = new URLSearchParams(search);
  applyParameter(parameters, REQUIRED_TAGS_PARAM, [...condition.required].join(TAG_SEPARATOR));
  applyParameter(parameters, EXCLUDED_TAGS_PARAM, [...condition.excluded].join(TAG_SEPARATOR));
  applyParameter(
    parameters,
    MATCH_PARAM,
    condition.matchAll && condition.required.size > 0 ? MATCH_ALL_VALUE : "",
  );
  const value = parameters.toString();
  return value.length === 0 ? "" : `?${value}`;
}
