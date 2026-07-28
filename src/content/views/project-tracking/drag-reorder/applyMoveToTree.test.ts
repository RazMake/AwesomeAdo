import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";

import { applyMoveToTree, applyRanksToTree } from "./applyMoveToTree";

/** A tracked item with only the fields this module reads; the rest are inert defaults. */
function item(id: number, importance: number, children: TrackedWorkItem[] = []): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "User Story",
    title: `Item ${id}`,
    state: "Active",
    assignedTo: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "",
    createdBy: null,
    changedDate: "",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    tags: [],
    importance,
    noteCount: 0,
    eta: null,
    children,
  };
}

/**
 * A two-level tree: root(0) → parent 10 [items 1, 2] and parent 20 [items 3, 4].
 * Rebuilt per test so a mutation in one can never leak into another.
 */
function buildTree(): TrackedWorkItem {
  return item(0, 0, [
    item(10, 100, [item(1, 1000), item(2, 2000)]),
    item(20, 200, [item(3, 3000), item(4, 4000)]),
  ]);
}

/** The item with `id` anywhere at or below `root`; tests only ask for ids they placed there. */
function findItem(root: TrackedWorkItem, id: number): TrackedWorkItem {
  const found = findItemOrNull(root, id);
  if (found === null) {
    throw new Error(`Item ${id} is not in the tree`);
  }
  return found;
}

function findItemOrNull(root: TrackedWorkItem, id: number): TrackedWorkItem | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findItemOrNull(child, id);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The ids the item with `parentId` currently holds, in array order. */
const childIdsOf = (root: TrackedWorkItem, parentId: number): number[] =>
  findItem(root, parentId).children.map((child) => child.id);

/** The importance of the item with `id`. */
const importanceOf = (root: TrackedWorkItem, id: number): number => findItem(root, id).importance;

describe("applyMoveToTree - re-homing", () => {
  it("moves the item to its new parent and takes ADO's reported rank", () => {
    const root = buildTree();

    expect(applyMoveToTree(root, { id: 2, parentId: 20, previousId: 3, nextId: 4 }, 3500)).toBe(
      true,
    );

    expect(childIdsOf(root, 10)).toEqual([1]);
    expect(childIdsOf(root, 20)).toEqual([3, 4, 2]);
    expect(importanceOf(root, 2)).toBe(3500);
  });

  it("keeps the item under the same parent when only its rank changed", () => {
    const root = buildTree();

    expect(applyMoveToTree(root, { id: 2, parentId: 10, previousId: 0, nextId: 1 }, 500)).toBe(
      true,
    );

    expect(childIdsOf(root, 10)).toEqual([1, 2]);
    expect(importanceOf(root, 2)).toBe(500);
  });

  it("is idempotent when the destination already holds the item", () => {
    const root = buildTree();
    const move = { id: 2, parentId: 20, previousId: 3, nextId: 4 };

    expect(applyMoveToTree(root, move, 3500)).toBe(true);
    expect(applyMoveToTree(root, move, 3500)).toBe(true);

    expect(childIdsOf(root, 20)).toEqual([3, 4, 2]);
    expect(importanceOf(root, 2)).toBe(3500);
  });

  it("can move an item up to the tree's own root level", () => {
    const root = buildTree();

    expect(applyMoveToTree(root, { id: 3, parentId: 0, previousId: 10, nextId: 20 }, 150)).toBe(
      true,
    );

    expect(childIdsOf(root, 0)).toEqual([10, 20, 3]);
    expect(childIdsOf(root, 20)).toEqual([4]);
  });
});

describe("applyMoveToTree - a tree that cannot absorb the move", () => {
  it("returns false when the moved item is not in this tree", () => {
    const root = buildTree();

    expect(applyMoveToTree(root, { id: 99, parentId: 20, previousId: 3, nextId: 0 }, 1)).toBe(
      false,
    );
    expect(childIdsOf(root, 20)).toEqual([3, 4]);
  });

  it("returns false when the item has no parent here, because it IS the root", () => {
    const root = buildTree();

    expect(applyMoveToTree(root, { id: 0, parentId: 10, previousId: 0, nextId: 0 }, 1)).toBe(false);
    expect(childIdsOf(root, 10)).toEqual([1, 2]);
  });

  it("returns false when the destination parent is not in this tree", () => {
    const root = buildTree();

    expect(applyMoveToTree(root, { id: 2, parentId: 999, previousId: 0, nextId: 0 }, 1)).toBe(
      false,
    );
    expect(childIdsOf(root, 10)).toEqual([1, 2]);
  });
});

describe("applyMoveToTree - estimating a rank ADO did not report", () => {
  it("splits the difference between the two neighbours it landed between", () => {
    const root = buildTree();

    applyMoveToTree(root, { id: 2, parentId: 20, previousId: 3, nextId: 4 }, null);

    expect(importanceOf(root, 2)).toBe(3500);
  });

  it("ranks just after the previous sibling when it landed last", () => {
    const root = buildTree();

    applyMoveToTree(root, { id: 2, parentId: 20, previousId: 4, nextId: 0 }, null);

    expect(importanceOf(root, 2)).toBe(4001);
  });

  it("ranks just before the next sibling when it landed first", () => {
    const root = buildTree();

    applyMoveToTree(root, { id: 2, parentId: 20, previousId: 0, nextId: 3 }, null);

    expect(importanceOf(root, 2)).toBe(2999);
  });

  it("keeps the item's existing rank when neither neighbour can be resolved", () => {
    const root = buildTree();

    // Both sentinels: the destination level is empty as far as the placement is concerned, so there
    // is nothing to interpolate between and the item must not be catapulted to rank 0.
    applyMoveToTree(root, { id: 2, parentId: 20, previousId: 0, nextId: 0 }, null);

    expect(importanceOf(root, 2)).toBe(2000);
  });

  it("keeps the existing rank when the named neighbours are not in the destination level", () => {
    const root = buildTree();

    applyMoveToTree(root, { id: 2, parentId: 20, previousId: 77, nextId: 88 }, null);

    expect(importanceOf(root, 2)).toBe(2000);
  });
});

describe("applyRanksToTree", () => {
  it("copies every reported rank onto the matching item, at any depth", () => {
    const root = buildTree();

    // Placing one item can renumber its whole level, so refreshing only the moved item would leave
    // its siblings holding ranks Azure DevOps no longer has and scramble the next re-sort.
    applyRanksToTree(root, [
      { id: 3, rank: 100000 },
      { id: 4, rank: 200000 },
      { id: 20, rank: 5 },
    ]);

    expect(importanceOf(root, 3)).toBe(100000);
    expect(importanceOf(root, 4)).toBe(200000);
    expect(importanceOf(root, 20)).toBe(5);
  });

  it("ignores a rank for an item this tree does not hold", () => {
    const root = buildTree();

    applyRanksToTree(root, [{ id: 99, rank: 1 }]);

    expect(importanceOf(root, 1)).toBe(1000);
  });
});
