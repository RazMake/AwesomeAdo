import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../ado/TrackedWorkItem";
import { MANUAL_ORDERING_POLICY } from "../../../ordering/ItemOrdering";

import { collectRolledUpDescendants } from "./rolledUpDescendants";

function item(
  id: number,
  title: string,
  importance: number,
  children: TrackedWorkItem[] = [],
): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Task",
    title,
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    tags: [],
    noteCount: 0,
    importance,
    eta: null,
    children,
  };
}

/** Grandparent → two children, the first of which owns a grandchild and a great-grandchild. */
function tree(): TrackedWorkItem {
  return item(1, "Root", 1, [
    item(2, "Beta", 1, [item(4, "Delta", 1, [item(5, "Epsilon", 1)])]),
    item(3, "Alpha", 2),
  ]);
}

const everything = (): boolean => true;

describe("collectRolledUpDescendants", () => {
  it("flattens every level beneath the parent, deepest included", () => {
    const collected = collectRolledUpDescendants(tree(), everything, MANUAL_ORDERING_POLICY);

    // Depth-first: a level's items are listed directly under the item they hang off.
    expect(collected.map(({ item: child }) => child.id)).toEqual([2, 4, 5, 3]);
    expect(collected.map(({ depth }) => depth)).toEqual([0, 1, 2, 0]);
  });

  it("reports each item's own parent and its full level, so a drag ranks against the right one", () => {
    const collected = collectRolledUpDescendants(tree(), everything, MANUAL_ORDERING_POLICY);

    expect(collected.map(({ parent }) => parent.id)).toEqual([1, 2, 4, 1]);
    expect(collected.map(({ siblingIds }) => siblingIds)).toEqual([[2, 3], [4], [5], [2, 3]]);
  });

  it("orders each level on its own rather than the flattened result", () => {
    const collected = collectRolledUpDescendants(tree(), everything, "title");

    // "Alpha" sorts ahead of "Beta" within the first level, but "Delta" stays under "Beta" instead
    // of sorting into the top level between them.
    expect(collected.map(({ item: child }) => child.title)).toEqual([
      "Alpha",
      "Beta",
      "Delta",
      "Epsilon",
    ]);
  });

  it("stops at an item the caller excluded, which renders its own rollup instead", () => {
    // Item 2 renders as a row of its own, so the badge neither lists it nor reaches past it — the
    // levels beneath it belong to the badge that row renders for itself.
    const collected = collectRolledUpDescendants(
      tree(),
      (child) => child.id !== 2,
      MANUAL_ORDERING_POLICY,
    );

    expect(collected.map(({ item: child }) => child.id)).toEqual([3]);
  });

  it("reports the depth the caller's rule was asked about", () => {
    const asked: { id: number; depth: number }[] = [];
    collectRolledUpDescendants(
      tree(),
      (child, depth) => {
        asked.push({ id: child.id, depth });
        return true;
      },
      MANUAL_ORDERING_POLICY,
    );

    expect(asked).toEqual([
      { id: 2, depth: 0 },
      { id: 3, depth: 0 },
      { id: 4, depth: 1 },
      { id: 5, depth: 2 },
    ]);
  });

  it("collects nothing from a childless parent", () => {
    expect(
      collectRolledUpDescendants(item(1, "Root", 1), everything, MANUAL_ORDERING_POLICY),
    ).toEqual([]);
  });
});
