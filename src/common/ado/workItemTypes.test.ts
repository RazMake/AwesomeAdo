import { describe, expect, it } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "./TrackedWorkItem";
import {
  flattenWorkItems,
  orderTrackedItems,
  primaryWorkAncestors,
  primaryWorkTypes,
  primaryWorkWithAncestors,
  primaryWorkWithDescendants,
  workItemIdsVisibleUnderPrimaryFilter,
  workItemsEligibleForPrimaryFilter,
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

/**
 * Portfolio → Epic → Feature → two Stories. Story 3 matches and owns a Task and a Subtask below it;
 * Story 5 does not match but owns a Task that does, so "a match under a non-match" is covered too.
 */
const DEEP_TREE = item({
  id: 0,
  type: "Portfolio",
  children: [
    item({
      id: 1,
      type: "Epic",
      children: [
        item({
          id: 2,
          type: "Feature",
          children: [
            item({
              id: 3,
              type: "Story",
              title: "matching",
              children: [
                item({
                  id: 4,
                  type: "Task",
                  title: "does not match",
                  children: [item({ id: 7, type: "Subtask", title: "does not match" })],
                }),
              ],
            }),
            item({
              id: 5,
              type: "Story",
              title: "does not match",
              children: [item({ id: 6, type: "Task", title: "matching" })],
            }),
          ],
        }),
      ],
    }),
  ],
});

const ascending = (left: number, right: number): number => left - right;

describe("workItemIdsVisibleUnderPrimaryFilter", () => {
  it("filters Primary work across arbitrarily deep ancestor and implementation chains", () => {
    const visible = workItemIdsVisibleUnderPrimaryFilter(
      [DEEP_TREE],
      CATALOG,
      (candidate) => candidate.title === "matching",
    );

    expect([...visible].sort(ascending)).toEqual([0, 1, 2, 3, 4, 7]);
  });

  it("keeps the legacy per-item matching rule when Primary work is not configured", () => {
    const visible = workItemIdsVisibleUnderPrimaryFilter(
      [DEEP_TREE],
      CATALOG.map((entry) => ({ ...entry, isPrimaryWork: false })),
      (candidate) => candidate.id === 5,
    );

    // Item 5's ancestors come with it, but its child 6 does NOT: with no classification, an item is
    // only ever on screen because it matched for itself or an ancestor of one that did.
    expect([...visible].sort(ascending)).toEqual([0, 1, 2, 5]);
  });

  it("never asks the filter about work it is not allowed to judge", () => {
    const asked: number[] = [];
    workItemIdsVisibleUnderPrimaryFilter([DEEP_TREE], CATALOG, (candidate) => {
      asked.push(candidate.id);
      return false;
    });

    expect(asked.sort(ascending)).toEqual([3, 5]);
  });

  it("hides everything, ancestors included, when no Primary work matches", () => {
    expect([...workItemIdsVisibleUnderPrimaryFilter([DEEP_TREE], CATALOG, () => false)]).toEqual(
      [],
    );
  });

  it("stops walking ancestors once the same id turns up at two depths", () => {
    // Defensive: a query that returns one item twice at different depths makes the parent links
    // circular, and a render pass must narrow the board rather than hang on it.
    const repeated = item({
      id: 1,
      type: "Feature",
      children: [
        item({
          id: 2,
          type: "Story",
          title: "matching",
          children: [
            item({ id: 3, type: "Task", children: [item({ id: 1, type: "Story", title: "x" })] }),
          ],
        }),
      ],
    });

    const visible = workItemIdsVisibleUnderPrimaryFilter(
      [repeated],
      CATALOG,
      (candidate) => candidate.title === "matching",
    );

    expect([...visible].sort(ascending)).toEqual([1, 2, 3]);
  });
});

/** Epic → the milestones given, the shape a project has while its phases are being planned. */
const milestoneTree = (...features: TrackedWorkItem[]): TrackedWorkItem =>
  item({ id: 1, type: "Epic", title: "project", children: features });

/** A milestone with implementation detail but no delivery under it, so the filters DO judge it. */
const startedMilestone = (id: number, title: string): TrackedWorkItem =>
  item({ id, type: "Feature", title, children: [item({ id: id * 10, type: "Task", title })] });

const matchingTitles = (candidate: TrackedWorkItem): boolean => candidate.title === "matching";

describe("workItemIdsVisibleUnderPrimaryFilter — planning nothing can speak for", () => {
  it("lets the caller decide which filters can speak to a childless planning item", () => {
    const asked: string[] = [];
    const visible = workItemIdsVisibleUnderPrimaryFilter(
      [milestoneTree(item({ id: 2, type: "Feature" }))],
      CATALOG,
      (candidate, subject) => {
        asked.push(`${candidate.id}:${subject}`);
        return subject === "empty-planning";
      },
    );

    expect([...visible].sort(ascending)).toEqual([1, 2]);
    expect(asked).toContain("2:empty-planning");
  });

  it("still judges a planning item that holds something, rather than pinning it on screen", () => {
    const tree = milestoneTree(
      startedMilestone(2, "matching"),
      startedMilestone(3, "does not match"),
    );

    const visible = workItemIdsVisibleUnderPrimaryFilter([tree], CATALOG, matchingTitles);

    expect([...visible].sort(ascending)).toEqual([1, 2]);
  });

  it("tells the caller what it is judging, so a filter that cannot speak to one can stand down", () => {
    const subjects: string[] = [];
    workItemIdsVisibleUnderPrimaryFilter([DEEP_TREE], CATALOG, (candidate, subject) => {
      subjects.push(`${candidate.type}:${subject}`);
      return false;
    });

    expect(subjects).toEqual(["Story:primary-work", "Story:primary-work"]);
    expect(
      workItemIdsVisibleUnderPrimaryFilter(
        [milestoneTree(startedMilestone(2, "x"))],
        CATALOG,
        (_candidate, subject) => subject === "planning-without-work",
      ).has(2),
    ).toBe(true);
  });

  it("never lets a planning item drag the unmatched milestones under it along", () => {
    const tree = milestoneTree(startedMilestone(2, "does not match"));
    tree.title = "matching";

    expect([...workItemIdsVisibleUnderPrimaryFilter([tree], CATALOG, matchingTitles)]).toEqual([1]);
  });

  it("leaves a planning item that HOLDS Primary work to be spoken for by that work", () => {
    // Feature 2 is filtered out only because its Story is: an empty-branch rule that also caught
    // this one would put every unmatched milestone back on a filtered board.
    const tree = milestoneTree(
      item({ id: 2, type: "Feature", children: [item({ id: 3, type: "Story", title: "no" })] }),
    );

    expect([...workItemIdsVisibleUnderPrimaryFilter([tree], CATALOG, () => false)]).toEqual([]);
  });

  it("never judges implementation detail on its own, however empty it is", () => {
    const asked: string[] = [];
    workItemIdsVisibleUnderPrimaryFilter([DEEP_TREE], CATALOG, (candidate) => {
      asked.push(candidate.type);
      return false;
    });

    expect(asked).not.toContain("Task");
    expect(asked).not.toContain("Subtask");
  });
});

describe("workItemsEligibleForPrimaryFilter", () => {
  it("returns only Primary-work items as filter candidates", () => {
    expect(workItemsEligibleForPrimaryFilter([DEEP_TREE], CATALOG).map(({ id }) => id)).toEqual([
      3, 5,
    ]);
  });

  it("treats every item as a candidate while Primary work is unconfigured", () => {
    const unconfigured = CATALOG.map((entry) => ({ ...entry, isPrimaryWork: false }));

    expect(
      workItemsEligibleForPrimaryFilter([DEEP_TREE], unconfigured).map(({ id }) => id),
    ).toEqual([0, 1, 2, 3, 4, 7, 5, 6]);
  });
});

describe("flattenWorkItems", () => {
  it("lists the roots and every descendant, parents ahead of their children", () => {
    const flattened = flattenWorkItems([
      item({ id: 1, children: [item({ id: 2, children: [item({ id: 3 })] }), item({ id: 4 })] }),
      item({ id: 5 }),
    ]);

    expect(flattened.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("has nothing to list for no roots", () => {
    expect(flattenWorkItems([])).toEqual([]);
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
