import { describe, expect, it } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "./TrackedWorkItem";
import {
  orderTrackedItems,
  primaryWorkAncestors,
  primaryWorkTypes,
  primaryWorkWithAncestors,
  primaryWorkWithDescendants,
  workItemTypeColor,
  workItemTypeTextColor,
} from "./workItemTypes";

function type(
  name: string,
  children: string[],
  isPrimaryWork = false,
  color = "0078d4",
): TypeCatalogEntry {
  return { name, color, icon: "", isPrimaryWork, etaField: null, columns: [], children };
}

/** Epic → Feature → Story → Task, with Story the only trackable delivery. */
const CATALOG: TypeCatalogEntry[] = [
  type("Epic", ["Feature"]),
  type("Feature", ["Story"]),
  type("Story", ["Task"], true),
  type("Task", []),
];

function item(overrides: Partial<TrackedWorkItem>): TrackedWorkItem {
  return {
    id: 1,
    rev: 1,
    type: "Story",
    title: "",
    state: "New",
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
    tags: [],
    importance: 0,
    eta: null,
    children: [],
    ...overrides,
  };
}

describe("workItemTypeColor", () => {
  it("adds the missing '#' settings store the color without", () => {
    expect(workItemTypeColor("0078d4")).toBe("#0078d4");
  });

  it("leaves an already-prefixed color alone", () => {
    expect(workItemTypeColor("#0078d4")).toBe("#0078d4");
  });

  it("reports every kind of absent color as no color, never a bare '#'", () => {
    expect(workItemTypeColor("")).toBeNull();
    expect(workItemTypeColor(null)).toBeNull();
    expect(workItemTypeColor(undefined)).toBeNull();
  });
});

describe("workItemTypeTextColor", () => {
  it("keeps an uncolored type readable by falling back to the theme foreground", () => {
    expect(workItemTypeTextColor("")).toBe("var(--text-primary-color)");
    expect(workItemTypeTextColor("cc293d")).toBe("#cc293d");
  });
});

describe("primary work type closures", () => {
  it("reports only the types the team marked as primary work", () => {
    expect([...primaryWorkTypes(CATALOG)]).toEqual(["Story"]);
  });

  it("counts everything configured beneath primary work as the same delivery", () => {
    expect([...primaryWorkWithDescendants(CATALOG)].sort()).toEqual(["Story", "Task"]);
  });

  it("offers every type that leads down to primary work as planning context", () => {
    expect([...primaryWorkAncestors(CATALOG)].sort()).toEqual(["Epic", "Feature"]);
  });

  it("counts a primary type that parents other primary work as context too", () => {
    const nested = [type("Feature", ["Story"], true), type("Story", [], true)];
    expect([...primaryWorkAncestors(nested)]).toEqual(["Feature"]);
  });

  it("shows primary work plus the ancestors needed to reach it as tree rows", () => {
    expect([...primaryWorkWithAncestors(CATALOG)].sort()).toEqual(["Epic", "Feature", "Story"]);
  });

  it("returns nothing when the team marked no type as primary work", () => {
    const unconfigured = [type("Epic", ["Feature"]), type("Feature", [])];
    expect([...primaryWorkWithAncestors(unconfigured)]).toEqual([]);
    expect([...primaryWorkWithDescendants(unconfigured)]).toEqual([]);
  });
});

describe("orderTrackedItems", () => {
  const alpha = item({ id: 1, title: "Beta", importance: 2, eta: "2026-03-01T00:00:00Z" });
  const beta = item({ id: 2, title: "Alpha", importance: 1, eta: "2026-01-01T00:00:00Z" });

  it("orders by backlog rank under the importance policy", () => {
    expect(
      orderTrackedItems([alpha, beta], (entry) => entry, "importance").map((i) => i.id),
    ).toEqual([2, 1]);
  });

  it("orders by title under the title policy", () => {
    expect(orderTrackedItems([alpha, beta], (entry) => entry, "title").map((i) => i.id)).toEqual([
      2, 1,
    ]);
  });

  it("adapts the ISO ETA to the epoch milliseconds the policy compares", () => {
    expect(orderTrackedItems([alpha, beta], (entry) => entry, "eta").map((i) => i.id)).toEqual([
      2, 1,
    ]);
  });

  it("orders caller wrappers without making the caller unwrap them first", () => {
    const wrapped = [{ item: alpha }, { item: beta }];
    expect(orderTrackedItems(wrapped, (entry) => entry.item, "title")).toEqual([
      { item: beta },
      { item: alpha },
    ]);
  });

  it("sorts an item with an unparseable ETA after the ones that have a real date", () => {
    const undated = item({ id: 3, title: "Gamma", eta: "not a date" });
    expect(
      orderTrackedItems([undated, beta], (entry) => entry, "eta").map((entry) => entry.id),
    ).toEqual([2, 3]);
  });
});
