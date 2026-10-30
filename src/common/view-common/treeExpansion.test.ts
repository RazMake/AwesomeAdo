import { describe, expect, it } from "vitest";

import { stepTreeExpansion } from "./treeExpansion";

const LEVELS = [[1, 4], [2, 5], [3]];

describe("stepTreeExpansion", () => {
  it("opens one hierarchy depth at a time, starting with the shallowest closed level", () => {
    const expanded = new Set([1, 99]);

    expect(stepTreeExpansion(expanded, LEVELS, true)).toBe(0);
    expect(expanded).toEqual(new Set([1, 4, 99]));
    expect(stepTreeExpansion(expanded, LEVELS, true)).toBe(1);
    expect(expanded).toEqual(new Set([1, 2, 4, 5, 99]));
    expect(stepTreeExpansion(expanded, LEVELS, true)).toBe(2);
    expect(expanded).toEqual(new Set([1, 2, 3, 4, 5, 99]));
    expect(stepTreeExpansion(expanded, LEVELS, true)).toBeNull();
  });

  it("closes one hierarchy depth at a time, starting with the deepest open level", () => {
    const expanded = new Set([1, 2, 3, 4, 5, 99]);

    expect(stepTreeExpansion(expanded, LEVELS, false)).toBe(2);
    expect(expanded).toEqual(new Set([1, 2, 4, 5, 99]));
    expect(stepTreeExpansion(expanded, LEVELS, false)).toBe(1);
    expect(expanded).toEqual(new Set([1, 4, 99]));
    expect(stepTreeExpansion(expanded, LEVELS, false)).toBe(0);
    expect(expanded).toEqual(new Set([99]));
    expect(stepTreeExpansion(expanded, LEVELS, false)).toBeNull();
  });

  it("fills a partially open level before opening anything deeper", () => {
    const expanded = new Set([1, 2, 3]);

    expect(stepTreeExpansion(expanded, LEVELS, true)).toBe(0);
    expect(expanded).toEqual(new Set([1, 2, 3, 4]));
    expect(stepTreeExpansion(expanded, LEVELS, true)).toBe(1);
    expect(expanded).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("closes a partially open deepest level even when its ancestor is closed", () => {
    const expanded = new Set([2, 4]);

    expect(stepTreeExpansion(expanded, LEVELS, false)).toBe(1);
    expect(expanded).toEqual(new Set([4]));
  });

  it.each([true, false])("ignores empty levels when setting expanded=%s", (expanded) => {
    const ids = new Set([99]);
    const levels = [[], [1], []];

    expect(stepTreeExpansion(ids, [], expanded)).toBeNull();
    expect(stepTreeExpansion(ids, [[], []], expanded)).toBeNull();
    expect(stepTreeExpansion(ids, levels, expanded)).toBe(expanded ? 1 : null);
    expect(levels).toEqual([[], [1], []]);
    expect(ids.has(99)).toBe(true);
  });
});
