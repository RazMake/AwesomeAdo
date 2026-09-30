import { describe, expect, it } from "vitest";

import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../../common/ado/TrackedWorkItem";

import { assigneesInTree, planningIdsOwnedBySelection } from "./assigneeFilter";

function type(name: string, children: string[], isPrimaryWork = false): TypeCatalogEntry {
  return { name, color: "", icon: "", isPrimaryWork, etaField: null, columns: [], children };
}

const CATALOG: TypeCatalogEntry[] = [
  type("Epic", ["Feature"]),
  type("Feature", ["Story"]),
  type("Story", ["Task"], true),
  type("Task", []),
];

function user(alias: string): TrackedUser {
  return { displayName: alias.toUpperCase(), uniqueName: `${alias}@contoso.com`, imageUrl: null };
}

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

const TREE = item({
  id: 1,
  type: "Epic",
  children: [
    item({
      id: 2,
      type: "Feature",
      assignedTo: user("lead"),
      children: [item({ id: 3, type: "Story", assignedTo: user("dev") })],
    }),
  ],
});

describe("assigneesInTree", () => {
  it("offers owners of planning items alongside Primary work assignees", () => {
    expect(assigneesInTree([TREE]).map((option) => option.key)).toEqual(["dev", "lead"]);
  });
});

describe("planningIdsOwnedBySelection", () => {
  it("keeps a selected owner's Feature and its ancestors even when no child matches", () => {
    const ids = planningIdsOwnedBySelection(TREE, CATALOG, new Set(["lead"]), () => true);
    expect([...ids].sort()).toEqual([1, 2]);
  });

  it("ignores Primary work, rejected items, and an empty selection", () => {
    expect(planningIdsOwnedBySelection(TREE, CATALOG, new Set(["dev"]), () => true).size).toBe(0);
    expect(planningIdsOwnedBySelection(TREE, CATALOG, new Set(["lead"]), () => false).size).toBe(0);
    expect(planningIdsOwnedBySelection(TREE, CATALOG, new Set(), () => true).size).toBe(0);
  });
});
