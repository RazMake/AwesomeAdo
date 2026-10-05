import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

import { tagConditionOf } from "./TagConditionFilter";
import {
  describeTagCondition,
  emptyTagCondition,
  matchesTagCondition,
  pruneTagCondition,
  type TagCondition,
} from "./tagCondition";

function tagged(tags: string[]): TrackedWorkItem {
  return { id: 1, tags, children: [] } as unknown as TrackedWorkItem;
}

function condition(overrides: Partial<TagCondition> = {}): TagCondition {
  return { ...emptyTagCondition(), ...overrides };
}

describe("matchesTagCondition", () => {
  it("keeps every item while the condition narrows nothing", () => {
    expect(matchesTagCondition(tagged([]), emptyTagCondition())).toBe(true);
  });

  it("requires any one of the required tags, compared case-insensitively", () => {
    const anyOf = condition({ required: new Set(["api", "web"]) });

    expect(matchesTagCondition(tagged(["API"]), anyOf)).toBe(true);
    expect(matchesTagCondition(tagged(["docs"]), anyOf)).toBe(false);
  });

  it("requires every required tag when combining with all", () => {
    const allOf = condition({ required: new Set(["api", "web"]), matchAll: true });

    expect(matchesTagCondition(tagged(["api"]), allOf)).toBe(false);
    expect(matchesTagCondition(tagged(["web", "api"]), allOf)).toBe(true);
  });

  it("rules out an item wearing an excluded tag even when it also matches a required one", () => {
    const mixed = condition({ required: new Set(["api"]), excluded: new Set(["legacy"]) });

    expect(matchesTagCondition(tagged(["api", " Legacy "]), mixed)).toBe(false);
    expect(
      matchesTagCondition(tagged(["legacy"]), condition({ excluded: new Set(["legacy"]) })),
    ).toBe(false);
  });
});

describe("describeTagCondition", () => {
  it("names an empty condition, and both halves of a mixed one", () => {
    expect(describeTagCondition(emptyTagCondition())).toBe("none");
    expect(
      describeTagCondition(
        condition({ required: new Set(["a", "b"]), excluded: new Set(["c"]), matchAll: true }),
      ),
    ).toBe("all of [a, b] and none of [c]");
    expect(describeTagCondition(condition({ required: new Set(["a"]) }))).toBe("any of [a]");
  });
});

describe("pruneTagCondition", () => {
  it("returns the same condition when every tag is still offered", () => {
    const kept = condition({ required: new Set(["api"]) });

    const pruned = pruneTagCondition(kept, ["API"]);

    expect(pruned.condition).toBe(kept);
    expect(pruned.dropped).toEqual([]);
  });

  it("drops required and excluded tags no longer offered, keeping the combining choice", () => {
    const pruned = pruneTagCondition(
      condition({ required: new Set(["api", "gone"]), excluded: new Set(["old"]), matchAll: true }),
      ["api"],
    );

    expect(pruned.dropped).toEqual(["gone", "old"]);
    expect(pruned.condition).toEqual(condition({ required: new Set(["api"]), matchAll: true }));
  });
});

describe("tagConditionOf", () => {
  it("lower-cases a filter selection into a condition", () => {
    expect(tagConditionOf({ included: ["Api"], excluded: ["Docs"], matchAll: true })).toEqual(
      condition({ required: new Set(["api"]), excluded: new Set(["docs"]), matchAll: true }),
    );
  });
});
