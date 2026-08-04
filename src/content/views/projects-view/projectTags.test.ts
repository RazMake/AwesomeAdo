import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

import { carriesAnyTag, idsKeptByTags, queryWideTags, tagsInUse } from "./projectTags";

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

describe("carriesAnyTag", () => {
  it("matches any one of the selected tags, ignoring case", () => {
    expect(carriesAnyTag(item(1, ["Api"]), new Set(["api", "security"]))).toBe(true);
  });

  it("does not match an item carrying none of them", () => {
    expect(carriesAnyTag(item(1, ["docs"]), new Set(["api"]))).toBe(false);
  });
});

describe("idsKeptByTags", () => {
  const tree = [
    item(1, [], [item(2, ["api"], [item(3, [])]), item(4, [])]),
    item(5, [], [item(6, ["docs"])]),
  ];
  const keptFor = (tag: string) => idsKeptByTags(tree, (candidate) => candidate.tags.includes(tag));

  it("keeps a match, the ancestors that lead to it, and everything beneath it", () => {
    expect([...keptFor("api")].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("drops the branches with no match at all", () => {
    expect(keptFor("api").has(4)).toBe(false);
    expect(keptFor("api").has(5)).toBe(false);
  });

  it("keeps every project that has a match somewhere beneath it", () => {
    expect([...keptFor("docs")].sort((a, b) => a - b)).toEqual([5, 6]);
  });

  it("keeps nothing when no item matches", () => {
    expect(keptFor("missing").size).toBe(0);
  });
});
