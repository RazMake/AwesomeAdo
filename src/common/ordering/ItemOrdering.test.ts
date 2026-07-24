import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORDERING_POLICY,
  ORDERING_POLICIES,
  orderItems,
  type OrderableItem,
} from "./ItemOrdering";

const item = (overrides: Partial<OrderableItem>): OrderableItem => ({
  importance: 0,
  title: "",
  eta: null,
  ...overrides,
});

describe("ORDERING_POLICIES", () => {
  it("offers importance, title, and ETA in picker order with their labels", () => {
    expect(ORDERING_POLICIES).toEqual([
      { value: "importance", label: "By Importance (most important first)" },
      { value: "title", label: "By Title (a-z)" },
      { value: "eta", label: "By ETA (past/recent - future)" },
    ]);
  });

  it("defaults to importance, the first policy", () => {
    expect(DEFAULT_ORDERING_POLICY).toBe("importance");
    expect(ORDERING_POLICIES[0]?.value).toBe(DEFAULT_ORDERING_POLICY);
  });
});

describe("orderItems", () => {
  it("orders by importance with the lowest rank (most important) first", () => {
    const items = [item({ importance: 3 }), item({ importance: 1 }), item({ importance: 2 })];
    expect(orderItems(items, "importance").map((entry) => entry.importance)).toEqual([1, 2, 3]);
  });

  it("orders by title alphabetically, case-insensitively", () => {
    const items = [item({ title: "banana" }), item({ title: "Apple" }), item({ title: "cherry" })];
    expect(orderItems(items, "title").map((entry) => entry.title)).toEqual([
      "Apple",
      "banana",
      "cherry",
    ]);
  });

  it("orders by ETA earliest first, placing items without an ETA last", () => {
    const items = [
      item({ title: "future", eta: 300 }),
      item({ title: "none", eta: null }),
      item({ title: "past", eta: 100 }),
      item({ title: "recent", eta: 200 }),
    ];
    expect(orderItems(items, "eta").map((entry) => entry.title)).toEqual([
      "past",
      "recent",
      "future",
      "none",
    ]);
  });

  it("keeps the original order for items that tie under the chosen policy", () => {
    const items = [
      item({ importance: 1, title: "first" }),
      item({ importance: 1, title: "second" }),
      item({ importance: 1, title: "third" }),
    ];
    expect(orderItems(items, "importance").map((entry) => entry.title)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [item({ importance: 2 }), item({ importance: 1 })];
    const before = [...items];
    orderItems(items, "importance");
    expect(items).toEqual(before);
  });
});
