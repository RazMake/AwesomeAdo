import { describe, expect, it } from "vitest";

import type { TeamMember } from "./TeamMembers";
import type { TrackedWorkItem } from "./TrackedWorkItem";
import { filterTreeForSprintRoster, wiqlForSprint } from "./sprintQuery";

function item(
  id: number,
  assignedTo: TrackedWorkItem["assignedTo"],
  children: TrackedWorkItem[] = [],
): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    title: `Item ${id}`,
    state: "New",
    priority: null,
    assignedTo,
    areaPath: "Project\\Team",
    iterationPath: "Project\\Sprint 1",
    sprintName: "Sprint 1",
    createdDate: "",
    createdBy: null,
    changedDate: "",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    noteCount: 0,
    tags: [],
    importance: id,
    eta: null,
    children,
  };
}

const ALICE = { displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null };
const BOB = { displayName: "Bob", uniqueName: "bob@example.com", imageUrl: null };
const MEMBERS: TeamMember[] = [
  { id: "alice", displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
];

describe("wiqlForSprint", () => {
  it("rewrites existing offsets from the original query for past, current, and future sprints", () => {
    const wiql =
      "WHERE [System.IterationPath] = @CurrentIteration('[Project]\\Team') + 3 OR [Custom.Sprint] = @CurrentSprint - 2";

    expect(wiqlForSprint(wiql, -1)).toBe(
      "WHERE [System.IterationPath] = @CurrentIteration('[Project]\\Team') - 1 OR [Custom.Sprint] = @CurrentSprint - 1",
    );
    expect(wiqlForSprint(wiql, 0)).toBe(
      "WHERE [System.IterationPath] = @CurrentIteration('[Project]\\Team') OR [Custom.Sprint] = @CurrentSprint",
    );
    expect(wiqlForSprint(wiql, 2)).toBe(
      "WHERE [System.IterationPath] = @CurrentIteration('[Project]\\Team') + 2 OR [Custom.Sprint] = @CurrentSprint + 2",
    );
  });
});

describe("filterTreeForSprintRoster", () => {
  it("keeps roster members, unassigned items, and only their parent chains", () => {
    const roots = [
      item(1, BOB, [item(2, BOB), item(3, BOB, [item(4, ALICE)])]),
      item(5, null),
      item(6, BOB),
    ];

    const filtered = filterTreeForSprintRoster(roots, MEMBERS);

    expect(filtered.map(({ id }) => id)).toEqual([1, 5]);
    expect(filtered[0]?.children.map(({ id }) => id)).toEqual([3]);
    expect(filtered[0]?.children[0]?.children.map(({ id }) => id)).toEqual([4]);
  });
});
