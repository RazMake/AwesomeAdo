import { describe, expect, it } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";

import {
  buildSprintBulkMovePlan,
  defaultSprintBulkMoveSelection,
  selectSprintBulkMoveCandidates,
  sprintBulkMoveAssignees,
  unassignedInSelection,
} from "./SprintBulkMovePlan";

const BOARD = ["Queue", "Active", "Waiting", "Done", "Removed"];

const types = new Map<string, TypeCatalogEntry>([
  [
    "Story",
    {
      name: "Story",
      isPrimaryWork: true,
      columns: [
        { column: "Queue", states: ["New"] },
        { column: "Active", states: ["Active"] },
        { column: "Waiting", states: ["Waiting"] },
        { column: "Done", states: ["Done"] },
        { column: "Removed", states: ["Removed"] },
      ],
    } as TypeCatalogEntry,
  ],
  ["Task", { name: "Task", isPrimaryWork: false, columns: [] } as unknown as TypeCatalogEntry],
]);

function item(id: number, assignee: string | null, state = "Active", type = "Story") {
  return {
    id,
    type,
    state,
    areaPath: "Project\\API",
    assignedTo:
      assignee === null
        ? null
        : { displayName: assignee, uniqueName: `${assignee.toLowerCase()}@example.com` },
  } as TrackedWorkItem;
}

const visible = [
  item(1, "Bob", "New"),
  item(2, "Alice", "Active"),
  item(3, null, "Waiting"),
  item(4, "Alice", "Waiting"),
  item(5, "Carol", "Done"),
  item(6, "Dave", "Removed"),
  item(7, "Erin", "Active", "Task"),
  item(8, null, "Done"),
];

describe("buildSprintBulkMovePlan", () => {
  it("offers every board column through Done, naming each as the board does", () => {
    const plan = buildSprintBulkMovePlan(visible, types, BOARD);

    expect(plan.columns).toEqual([
      { ordinal: 0, label: "Queue", movable: true },
      { ordinal: 1, label: "Active", movable: true },
      { ordinal: 2, label: "Waiting", movable: true },
      { ordinal: 3, label: "Done", movable: false },
    ]);
  });

  it("snapshots assigned visible Primary work outside Done and Removed, with its column", () => {
    const plan = buildSprintBulkMovePlan(visible, types, BOARD);

    expect(plan.candidates).toEqual([
      {
        id: 1,
        column: 0,
        areaPath: "Project\\API",
        assigneeValue: "bob@example.com",
        assigneeLabel: "Bob",
      },
      {
        id: 2,
        column: 1,
        areaPath: "Project\\API",
        assigneeValue: "alice@example.com",
        assigneeLabel: "Alice",
      },
      {
        id: 4,
        column: 2,
        areaPath: "Project\\API",
        assigneeValue: "alice@example.com",
        assigneeLabel: "Alice",
      },
    ]);
    expect(plan.unassignedColumns).toEqual([2]);
  });

  it("leaves a column label blank when the board configures fewer titles", () => {
    const plan = buildSprintBulkMovePlan([], types, ["Queue"]);

    expect(plan.columns.map(({ label }) => label)).toEqual(["Queue", "", "", ""]);
  });
});

describe("sprint bulk-move selection", () => {
  const plan = buildSprintBulkMovePlan(visible, types, BOARD);

  it("lists each assignee once, in display-name order", () => {
    expect(sprintBulkMoveAssignees(plan)).toEqual([
      { value: "alice@example.com", label: "Alice" },
      { value: "bob@example.com", label: "Bob" },
    ]);
  });

  it("starts with every movable column and every assignee, never Done", () => {
    const selection = defaultSprintBulkMoveSelection(plan);

    expect([...selection.columns]).toEqual([0, 1, 2]);
    expect([...selection.assignees]).toEqual(["bob@example.com", "alice@example.com"]);
    expect(selectSprintBulkMoveCandidates(plan, selection).map(({ id }) => id)).toEqual([1, 2, 4]);
  });

  it("keeps only candidates in a chosen column AND assigned to a chosen person", () => {
    const selection = { columns: new Set([1, 2]), assignees: new Set(["alice@example.com"]) };

    expect(selectSprintBulkMoveCandidates(plan, selection).map(({ id }) => id)).toEqual([2, 4]);
    expect(
      selectSprintBulkMoveCandidates(plan, {
        columns: new Set([0]),
        assignees: new Set(["alice@example.com"]),
      }),
    ).toEqual([]);
  });

  it("counts excluded unassigned cards only in the chosen columns", () => {
    const assignees = new Set<string>();

    expect(unassignedInSelection(plan, { columns: new Set([2]), assignees })).toBe(1);
    expect(unassignedInSelection(plan, { columns: new Set([0, 1]), assignees })).toBe(0);
  });
});
