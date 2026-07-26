import { describe, expect, it } from "vitest";

import { placementOf, resolveMove, type MovePlacement } from "./movePlacement";

/** The level the moved item starts in for the same-parent cases: 2, 3, 4 under parent 10. */
const LEVEL = [2, 3, 4] as const;

/** `resolveMove` options for a move inside `LEVEL`, with only the drop itself varying. */
const sameParentMove = (
  movedId: number,
  targetId: number,
  side: "before" | "after",
): MovePlacement | null =>
  resolveMove({
    movedId,
    currentParentId: 10,
    currentSiblingIds: LEVEL,
    targetId,
    side,
    targetParentId: 10,
    targetSiblingIds: LEVEL,
  });

describe("placementOf", () => {
  it("names both neighbours for an item in the middle of its level", () => {
    expect(placementOf(3, LEVEL, 10)).toEqual({ parentId: 10, previousId: 2, nextId: 4 });
  });

  it("uses the 0 sentinel above an item that sits first", () => {
    expect(placementOf(2, LEVEL, 10)).toEqual({ parentId: 10, previousId: 0, nextId: 3 });
  });

  it("uses the 0 sentinel below an item that sits last", () => {
    expect(placementOf(4, LEVEL, 10)).toEqual({ parentId: 10, previousId: 3, nextId: 0 });
  });

  it("uses both sentinels for an only child", () => {
    expect(placementOf(2, [2], 10)).toEqual({ parentId: 10, previousId: 0, nextId: 0 });
  });

  it("returns null for an id the level does not hold, so a stale board is not acted on", () => {
    expect(placementOf(99, LEVEL, 10)).toBeNull();
  });
});

describe("resolveMove - within one parent", () => {
  it("lands the item above the target when dropped before it", () => {
    expect(sameParentMove(4, 3, "before")).toEqual({ parentId: 10, previousId: 2, nextId: 3 });
  });

  it("lands the item below the target when dropped after it", () => {
    expect(sameParentMove(2, 3, "after")).toEqual({ parentId: 10, previousId: 3, nextId: 4 });
  });

  it("uses the 0 sentinel when the item lands first in the level", () => {
    expect(sameParentMove(4, 2, "before")).toEqual({ parentId: 10, previousId: 0, nextId: 2 });
  });

  it("uses the 0 sentinel when the item lands last in the level", () => {
    expect(sameParentMove(2, 4, "after")).toEqual({ parentId: 10, previousId: 4, nextId: 0 });
  });

  it("excludes the moved item from the level before naming its new neighbours", () => {
    // Item 2 is vacating its own slot, so dropping it after 3 must read the level as [3, 4] —
    // leaving it in would name 2 itself as the item's own previous sibling.
    expect(sameParentMove(2, 3, "after")).toEqual({ parentId: 10, previousId: 3, nextId: 4 });
  });
});

describe("resolveMove - into another parent", () => {
  it("carries the destination parent and its neighbours", () => {
    const move = resolveMove({
      movedId: 2,
      currentParentId: 10,
      currentSiblingIds: LEVEL,
      targetId: 6,
      side: "after",
      targetParentId: 20,
      targetSiblingIds: [5, 6, 7],
    });

    expect(move).toEqual({ parentId: 20, previousId: 6, nextId: 7 });
  });

  it("is a real move even when the neighbours happen to match the item's current ones", () => {
    // Same previous/next ids, different parent: the re-parent alone is the change, so treating this
    // as a no-op would silently drop the only thing the user asked for.
    const move = resolveMove({
      movedId: 2,
      currentParentId: 10,
      currentSiblingIds: [1, 2, 3],
      targetId: 1,
      side: "after",
      targetParentId: 20,
      targetSiblingIds: [1, 3],
    });

    expect(move).toEqual({ parentId: 20, previousId: 1, nextId: 3 });
  });
});

describe("resolveMove - drops that are not moves", () => {
  it("returns null when the item is dropped onto itself", () => {
    expect(sameParentMove(3, 3, "before")).toBeNull();
  });

  it("returns null when the target is not in the destination level", () => {
    expect(
      resolveMove({
        movedId: 2,
        currentParentId: 10,
        currentSiblingIds: LEVEL,
        targetId: 99,
        side: "before",
        targetParentId: 10,
        targetSiblingIds: LEVEL,
      }),
    ).toBeNull();
  });

  it("returns null when the drop reproduces the placement the item already has", () => {
    // Dropping 2 before 3 puts it back at the head of its own level: no ADO round-trip for that.
    expect(sameParentMove(2, 3, "before")).toBeNull();
    expect(sameParentMove(4, 3, "after")).toBeNull();
  });

  it("still resolves a move when the item's current level no longer holds it", () => {
    // A stale current level cannot prove the drop is a no-op, so the move must go ahead.
    const move = resolveMove({
      movedId: 2,
      currentParentId: 10,
      currentSiblingIds: [3, 4],
      targetId: 3,
      side: "before",
      targetParentId: 10,
      targetSiblingIds: LEVEL,
    });

    expect(move).toEqual({ parentId: 10, previousId: 0, nextId: 3 });
  });
});
