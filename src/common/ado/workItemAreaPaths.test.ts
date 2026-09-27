import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "./TrackedWorkItem";
import { isInAreaPathBranches, isInAreaPaths, representedAreaPaths } from "./workItemAreaPaths";

function itemIn(areaPath: string | null): TrackedWorkItem {
  return { areaPath } as TrackedWorkItem;
}

describe("representedAreaPaths", () => {
  it("offers each non-blank path once, alphabetically", () => {
    expect(
      representedAreaPaths([
        itemIn("Fabrikam\\Web"),
        itemIn(null),
        itemIn("Fabrikam\\Api"),
        itemIn("  "),
        itemIn("Fabrikam\\Web"),
      ]),
    ).toEqual(["Fabrikam\\Api", "Fabrikam\\Web"]);
  });
});

describe("isInAreaPaths", () => {
  it("keeps every item, pathless ones included, while nothing is selected", () => {
    expect(isInAreaPaths(null, [])).toBe(true);
    expect(isInAreaPaths("Fabrikam\\Api", new Set())).toBe(true);
  });

  it("matches a selected full path regardless of case", () => {
    expect(isInAreaPaths("Fabrikam\\Api", ["fabrikam\\api"])).toBe(true);
  });

  it("does not let a parent path bring its sub-areas along", () => {
    expect(isInAreaPaths("Fabrikam\\Api\\Auth", ["Fabrikam\\Api"])).toBe(false);
  });

  it("drops an item with no area path once a selection exists", () => {
    expect(isInAreaPaths(null, ["Fabrikam\\Api"])).toBe(false);
  });
});

describe("isInAreaPathBranches", () => {
  it("keeps every item while no ownership branch is configured", () => {
    expect(isInAreaPathBranches(null, [])).toBe(true);
    expect(isInAreaPathBranches("Fabrikam\\Api", [])).toBe(true);
  });

  it("matches a branch and its descendants without case", () => {
    expect(isInAreaPathBranches("Fabrikam\\Api", ["fabrikam\\api"])).toBe(true);
    expect(isInAreaPathBranches("Fabrikam\\Api\\Auth", ["FABRIKAM\\API"])).toBe(true);
  });

  it("does not match a sibling whose name only shares the branch prefix", () => {
    expect(isInAreaPathBranches("Fabrikam\\Api Tools", ["Fabrikam\\Api"])).toBe(false);
  });

  it("drops a pathless item once an ownership branch is configured", () => {
    expect(isInAreaPathBranches(null, ["Fabrikam\\Api"])).toBe(false);
  });
});
