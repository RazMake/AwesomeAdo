import { describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";

import {
  buildNewChildCommand,
  childTypeOf,
  newChildItem,
  newChildOfferFor,
  newChildSummary,
  newChildTypeOf,
} from "./NewChildCommands";

const TYPES = new Map<string, TypeCatalogEntry>(
  (
    [
      { name: "Epic", children: ["Feature"] },
      { name: "Feature", children: ["Story", "Bug"] },
      { name: "Story", isPrimaryWork: true, children: ["Task"] },
      { name: "Bug", isPrimaryWork: true, children: [] },
      { name: "Task", children: [] },
    ] as const
  ).map((type) => [
    type.name,
    {
      name: type.name,
      color: "4fc3f7",
      icon: `${type.name}.svg`,
      isPrimaryWork: "isPrimaryWork" in type ? type.isPrimaryWork : false,
      etaField: null,
      columns: [{ column: "Active", states: ["New", "Active"] }],
      children: [...type.children],
    },
  ]),
);

function itemOf(overrides: Partial<TrackedWorkItem> & { type: string }): TrackedWorkItem {
  return {
    id: 1,
    rev: 1,
    title: "User Authentication",
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: "Project\\Platform",
    iterationPath: "Project\\Sprint 1",
    sprintName: "Sprint 1",
    createdDate: "2026-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "2026-01-01T00:00:00Z",
    description: "",
    noteCount: 0,
    tags: [],
    importance: 10,
    eta: null,
    children: [],
    ...overrides,
  };
}

describe("childTypeOf", () => {
  it("takes the first allowed child type, the one a hierarchy move also defaults to", () => {
    expect(childTypeOf(itemOf({ type: "Feature" }), TYPES)).toBe("Story");
  });

  it("answers null for a type with no configured children, and for an unknown one", () => {
    expect(childTypeOf(itemOf({ type: "Task" }), TYPES)).toBeNull();
    expect(childTypeOf(itemOf({ type: "Impediment" }), TYPES)).toBeNull();
  });
});

describe("newChildOfferFor", () => {
  // Listed top-down the way a team configures it; Epic also holds Stories directly, so only the
  // config order decides which planning level is the one where work is identified.
  const LEVELED = new Map<string, TypeCatalogEntry>(
    (
      [
        { name: "Portfolio", children: ["Initiative"] },
        { name: "Initiative", children: ["Epic"] },
        { name: "Epic", children: ["Feature", "Story"] },
        { name: "Feature", children: ["Story", "Bug"] },
        { name: "Story", isPrimaryWork: true, children: ["Task"] },
        { name: "Bug", isPrimaryWork: true, children: [] },
        { name: "Task", children: [] },
      ] as const
    ).map((type) => [
      type.name,
      {
        name: type.name,
        color: "",
        icon: "",
        isPrimaryWork: "isPrimaryWork" in type ? type.isPrimaryWork : false,
        etaField: null,
        columns: [],
        children: [...type.children],
      },
    ]),
  );
  const offerOn = (type: string, types = LEVELED) => newChildOfferFor(itemOf({ type }), types);

  it("names the last planning type in config order as where new work is identified", () => {
    expect(offerOn("Feature")).toEqual({ label: "New work identified", childType: "Story" });
  });

  it("raises deliverables on the work level's parent, never its other children", () => {
    expect(offerOn("Epic")).toEqual({ label: "New deliverable", childType: "Feature" });
  });

  it("raises projects on every level above, creating the type on the way down", () => {
    expect(offerOn("Initiative")).toEqual({ label: "New project", childType: "Epic" });
    expect(offerOn("Portfolio")).toEqual({ label: "New project", childType: "Initiative" });
  });

  it("offers nothing on primary work, below it, or on an unknown type", () => {
    expect(offerOn("Story")).toBeNull();
    expect(offerOn("Task")).toBeNull();
    expect(offerOn("Impediment")).toBeNull();
  });

  it("offers nothing when no type is marked as Primary work", () => {
    const unmarked = new Map(
      [...LEVELED].map(([name, entry]) => [name, { ...entry, isPrimaryWork: false }]),
    );
    expect(offerOn("Feature", unmarked)).toBeNull();
  });

  it("creates the promised type, else the parent's default child", () => {
    expect(newChildTypeOf(itemOf({ type: "Portfolio" }), LEVELED)).toBe("Initiative");
    expect(newChildTypeOf(itemOf({ type: "Story" }), LEVELED)).toBe("Task");
  });
});

describe("buildNewChildCommand", () => {
  const command = (overrides: Partial<Parameters<typeof buildNewChildCommand>[1]> = {}) =>
    buildNewChildCommand("New work identified", {
      parent: itemOf({ type: "Feature" }),
      types: TYPES,
      adding: false,
      onAdd: () => undefined,
      ...overrides,
    });

  it("groups itself under its own rule and opens the box when chosen", () => {
    const onAdd = vi.fn();

    const built = command({ onAdd });
    built.run?.();

    expect(built.separatorBefore).toBe(true);
    expect(built.disabledReason).toBeNull();
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("stays visible but inert when the hierarchy allows nothing underneath", () => {
    expect(command({ parent: itemOf({ type: "Task" }) }).disabledReason).toContain(
      'No child work item type is configured under "Task"',
    );
  });

  it("refuses to re-open a box that is already asking for a title", () => {
    expect(command({ adding: true }).disabledReason).toContain("already open");
  });
});

describe("newChildSummary", () => {
  it("states the parent, area and iteration the reader is not being asked for", () => {
    expect(newChildSummary(itemOf({ type: "Feature" }), "Story")).toBe(
      "Created as a Story under User Authentication, in area Project\\Platform, in iteration Project\\Sprint 1.",
    );
  });

  it("leaves out a classification path the parent does not carry", () => {
    const bare = itemOf({ type: "Feature", areaPath: null, iterationPath: null });

    expect(newChildSummary(bare, "Story")).toBe("Created as a Story under User Authentication.");
  });
});

describe("newChildItem", () => {
  const created = (children: TrackedWorkItem[] = [], fields?: Record<string, unknown>) =>
    newChildItem({
      id: 900,
      rev: 1,
      fields,
      type: "Story",
      title: "Password reset",
      parent: itemOf({ type: "Feature", children }),
      types: TYPES,
      createdAt: "2026-07-24T12:00:00Z",
    });

  it("shows the values Azure DevOps defaulted, not blanks that correct themselves later", () => {
    const item = created([], {
      "System.WorkItemType": "Story",
      "System.Title": "Password reset",
      "System.State": "New",
      "Microsoft.VSTS.Common.Priority": 2,
      "System.AreaPath": "Project\\Platform",
      "System.IterationPath": "Project\\Sprint 1",
    });

    expect(item).toMatchObject({
      id: 900,
      type: "Story",
      title: "Password reset",
      state: "New",
      priority: 2,
      areaPath: "Project\\Platform",
      sprintName: "Sprint 1",
    });
  });

  it("ranks below every sibling even though ADO reported no backlog position", () => {
    const siblings = [
      itemOf({ id: 2, type: "Story", importance: 4 }),
      itemOf({ id: 3, type: "Story", importance: -2 }),
    ];

    expect(created(siblings, { "System.Title": "Password reset" }).importance).toBe(-3);
    expect(created([], { "System.Title": "Password reset" }).importance).toBe(-1);
  });

  describe("when Azure DevOps returned no fields", () => {
    it("states only what the board asked for, and where it asked for it", () => {
      expect(created()).toMatchObject({
        id: 900,
        type: "Story",
        title: "Password reset",
        areaPath: "Project\\Platform",
        iterationPath: "Project\\Sprint 1",
        sprintName: "Sprint 1",
        children: [],
      });
    });

    it("falls back to the first board column's primary state, where the workflow begins", () => {
      expect(created().state).toBe("New");
    });

    it("leaves the values the process owns unset rather than guessing at them", () => {
      expect(created().priority).toBeNull();
      expect(created().assignedTo).toBeNull();
    });

    it("still ranks below every sibling", () => {
      expect(created([itemOf({ id: 2, type: "Story", importance: 4 })]).importance).toBe(-1);
    });
  });
});
