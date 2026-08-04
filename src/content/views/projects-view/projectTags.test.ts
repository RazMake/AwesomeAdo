import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

import {
  idsKeptByTagCondition,
  isEmptyTagCondition,
  queryWideTags,
  tagsInUse,
  type TagCondition,
} from "./projectTags";

/** A minimal tracked item: only the fields these helpers read ever vary between cases. */
function item(id: number, tags: string[], children: TrackedWorkItem[] = []): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    title: `Item ${id}`,
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "",
    createdBy: null,
    changedDate: "",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    noteCount: 0,
    tags,
    importance: id,
    eta: null,
    children,
  };
}

describe("tagsInUse", () => {
  it("collects every distinct tag across the items, ordered case-insensitively", () => {
    expect(tagsInUse([item(1, ["security", "Api"]), item(2, ["backlog"])])).toEqual([
      "Api",
      "backlog",
      "security",
    ]);
  });

  it("treats tags that differ only in case as one, keeping the first spelling seen", () => {
    expect(tagsInUse([item(1, ["Security"]), item(2, ["security"])])).toEqual(["Security"]);
  });

  it("drops blank tags rather than offering an unselectable option", () => {
    expect(tagsInUse([item(1, ["  ", "Api"])])).toEqual(["Api"]);
  });

  it("leaves out the tags the caller identified as the query's own condition", () => {
    expect(tagsInUse([item(1, ["Catalog", "Api"])], new Set(["catalog"]))).toEqual(["Api"]);
  });
});

describe("queryWideTags", () => {
  it("names the tags every project carries", () => {
    const roots = [item(1, ["Catalog", "Api"]), item(2, ["Catalog"])];

    expect([...queryWideTags(roots)]).toEqual(["catalog"]);
  });

  it("ignores a tag one project is missing, however common it is", () => {
    const roots = [item(1, ["Catalog"]), item(2, ["Catalog"]), item(3, [])];

    expect(queryWideTags(roots).size).toBe(0);
  });

  it("claims nothing from a single project, where the condition cannot be told apart", () => {
    expect(queryWideTags([item(1, ["Catalog"])]).size).toBe(0);
  });
});

describe("idsKeptByTagCondition", () => {
  const tree = [
    item(1, [], [item(2, ["api"], [item(3, [])]), item(4, ["api", "legacy"])]),
    item(5, [], [item(6, ["docs"])]),
  ];
  const condition = (
    required: string[],
    excluded: string[] = [],
    matchAll = false,
  ): TagCondition => ({
    required: new Set(required),
    excluded: new Set(excluded),
    matchAll,
  });
  const ids = (kept: ReadonlySet<number> | null): number[] =>
    kept === null ? [] : [...kept].sort((a, b) => a - b);

  it("keeps everything when the condition narrows nothing", () => {
    expect(idsKeptByTagCondition(tree, condition([]))).toBeNull();
    expect(isEmptyTagCondition(condition([]))).toBe(true);
  });

  it("keeps a match, the ancestors that lead to it, and everything beneath it", () => {
    expect(ids(idsKeptByTagCondition(tree, condition(["docs"])))).toEqual([5, 6]);
  });

  it("drops the branches with no match at all", () => {
    expect(ids(idsKeptByTagCondition(tree, condition(["api"])))).toEqual([1, 2, 3, 4]);
  });

  it("keeps nothing when no item matches", () => {
    expect(ids(idsKeptByTagCondition(tree, condition(["missing"])))).toEqual([]);
  });

  it("requires any one tag by default and every tag once the caller asks for all", () => {
    expect(ids(idsKeptByTagCondition(tree, condition(["api", "docs"])))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(ids(idsKeptByTagCondition(tree, condition(["api", "legacy"], [], true)))).toEqual([
      1, 4,
    ]);
  });

  it("prunes a project that contains an excluded tag anywhere beneath it", () => {
    // Only item 6 wears "docs", yet its project (5) goes too: the reader asked for the projects that
    // do not CONTAIN the tag, not for the tree minus one row in the middle of it.
    expect(ids(idsKeptByTagCondition(tree, condition([], ["docs"])))).toEqual([1, 2, 3, 4]);
  });

  it("leaves the projects that contain none of the excluded tags alone", () => {
    expect(ids(idsKeptByTagCondition(tree, condition([], ["legacy"])))).toEqual([5, 6]);
  });

  it("answers a requirement only from the branches the exclusions left standing", () => {
    // Item 2 wears "api", but its project also holds the "legacy" item 4, so the project is gone.
    expect(ids(idsKeptByTagCondition(tree, condition(["api"], ["legacy"])))).toEqual([]);
  });
});
