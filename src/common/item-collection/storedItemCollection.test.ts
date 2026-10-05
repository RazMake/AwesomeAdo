import { describe, expect, it } from "vitest";

import type { CollectedItem } from "./ItemCollection";
import { decodeItemCollection, encodeItemCollection, fitsSyncBudget } from "./storedItemCollection";

const PREFIX = "https://dev.azure.com/o/p/_workitems/edit/";
const FEATURE: CollectedItem = { id: 7, title: "Ship it", type: "Feature", url: `${PREFIX}7` };
const BUG: CollectedItem = { id: 9, title: "Crash", type: "Bug", url: `${PREFIX}9` };
const ODD_LINK: CollectedItem = { id: 11, title: "Odd", type: "Task", url: "https://x/y?id=11&a" };
const UNLINKED: CollectedItem = { id: 12, title: "None", type: "Task", url: null };

function manyItems(count: number, title: string): CollectedItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: 1000 + index,
    title,
    type: "Product Backlog Item",
    url: `${PREFIX}${1000 + index}`,
  }));
}

describe("encodeItemCollection", () => {
  it("encodes no collection as null", () => {
    expect(encodeItemCollection(null)).toBeNull();
  });

  it("stores each link prefix once and keeps unusual links whole", () => {
    expect(encodeItemCollection({ items: [FEATURE, BUG, ODD_LINK, UNLINKED] })).toEqual({
      v: 1,
      prefixes: [PREFIX],
      items: [
        [7, "Feature", "Ship it", 0],
        [9, "Bug", "Crash", 0],
        [11, "Task", "Odd", "https://x/y?id=11&a"],
        [12, "Task", "None", null],
      ],
    });
  });

  it("shortens titles evenly so a long collection still fits the sync budget", () => {
    const items = manyItems(60, "A really long work item title ".repeat(4));
    const encoded = encodeItemCollection({ items });
    expect(fitsSyncBudget(encoded)).toBe(true);
    const titles = encoded?.items.map((item) => item[2]) ?? [];
    expect(new Set(titles).size).toBe(1);
    expect(titles[0]?.endsWith("…")).toBe(true);
    expect(decodeItemCollection(encoded)?.items.map((item) => item.id)).toEqual(
      items.map((item) => item.id),
    );
  });

  it("drops titles entirely and reports when even that cannot fit", () => {
    const encoded = encodeItemCollection({ items: manyItems(400, "Title") });
    expect(encoded?.items[0]?.[2]).toBe("");
    expect(fitsSyncBudget(encoded)).toBe(false);
  });
});

describe("decodeItemCollection", () => {
  it("round-trips an encoded collection", () => {
    const items = [FEATURE, BUG, ODD_LINK, UNLINKED];
    expect(decodeItemCollection(encodeItemCollection({ items }))).toEqual({ items });
  });

  it.each([undefined, null, "x", { v: 2, items: [] }, { v: 1 }])(
    "reads %j as no collection",
    (raw) => {
      expect(decodeItemCollection(raw)).toBeNull();
    },
  );

  it("skips malformed and duplicate entries", () => {
    const raw = {
      v: 1,
      items: [
        "nope",
        [0, "Bug", "Zero", null],
        [5, 1, "Bad type", null],
        [6, "Bug", "Bad link", 3],
        [7, "Bug", "Bad link kind", true],
        [8, "Bug", "Kept", null],
        [8, "Bug", "Duplicate", null],
      ],
    };
    expect(decodeItemCollection(raw)).toEqual({
      items: [{ id: 8, type: "Bug", title: "Kept", url: null }],
    });
  });
});
