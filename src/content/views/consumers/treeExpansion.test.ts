import { describe, expect, it } from "vitest";

import { collapseStep, expandStep, type ExpansionState } from "./treeExpansion";

function state(overrides: Partial<ExpansionState> = {}): ExpansionState {
  return {
    expandedIds: new Set(),
    expandedDescriptionIds: new Set(),
    expandedNoteIds: new Set(),
    ...overrides,
  };
}

const TWO_LEVELS = [[1, 2], [11]];

describe("collapseStep", () => {
  it("closes the open descriptions first, every one of them, and nothing else", () => {
    const open = state({
      expandedIds: new Set([1, 2, 11]),
      expandedDescriptionIds: new Set([1, 99]),
      expandedNoteIds: new Set([2]),
    });

    expect(collapseStep(open, [1, 2], TWO_LEVELS)).toBe("descriptions");
    expect(open.expandedDescriptionIds.size).toBe(0);
    expect(open.expandedNoteIds).toEqual(new Set([2]));
    expect(open.expandedIds).toEqual(new Set([1, 2, 11]));
  });

  it("closes the open discussions once no description is open", () => {
    const open = state({ expandedIds: new Set([1, 2, 11]), expandedNoteIds: new Set([2]) });

    expect(collapseStep(open, [1, 2], TWO_LEVELS)).toBe("discussions");
    expect(open.expandedNoteIds.size).toBe(0);
    expect(open.expandedIds).toEqual(new Set([1, 2, 11]));
  });

  it("ignores a panel open on an item that is not on screen", () => {
    const open = state({
      expandedIds: new Set([1, 2, 11]),
      expandedDescriptionIds: new Set([99]),
      expandedNoteIds: new Set([98]),
    });

    expect(collapseStep(open, [1, 2], TWO_LEVELS)).toBe("tree level 2");
    expect(open.expandedDescriptionIds).toEqual(new Set([99]));
  });

  it("then closes the tree from its deepest open level, one level per press", () => {
    const open = state({ expandedIds: new Set([1, 2, 11]) });

    expect(collapseStep(open, [1, 2], TWO_LEVELS)).toBe("tree level 2");
    expect(open.expandedIds).toEqual(new Set([1, 2]));
    expect(collapseStep(open, [1, 2], TWO_LEVELS)).toBe("tree level 1");
    expect(open.expandedIds.size).toBe(0);
    expect(collapseStep(open, [1, 2], TWO_LEVELS)).toBeNull();
  });
});

describe("expandStep", () => {
  it("opens the shallowest level that still has a closed row, one level per press", () => {
    const closed = state({ expandedIds: new Set([1]) });

    expect(expandStep(closed, TWO_LEVELS)).toBe("tree level 1");
    expect(closed.expandedIds).toEqual(new Set([1, 2]));
    expect(expandStep(closed, TWO_LEVELS)).toBe("tree level 2");
    expect(closed.expandedIds).toEqual(new Set([1, 2, 11]));
    expect(expandStep(closed, TWO_LEVELS)).toBeNull();
  });

  it("never opens a description or a discussion", () => {
    const closed = state();

    expandStep(closed, TWO_LEVELS);

    expect(closed.expandedDescriptionIds.size).toBe(0);
    expect(closed.expandedNoteIds.size).toBe(0);
  });
});
