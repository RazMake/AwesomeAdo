import { describe, expect, it } from "vitest";

import type { TeamMember } from "../../../common/ado/TeamMembers";
import type { SprintWindow } from "../../../common/ado/sprintWindow";

import {
  matchRequestedPeople,
  readSprintUrlPreferences,
  resolveSprintName,
  sprintSearchWith,
  urlAliasesFor,
} from "./sprintUrlPreferences";

const sprintWindow: SprintWindow = {
  entries: [
    {
      path: "Project\\Sprint 1",
      name: "Sprint 1",
      label: "Current - Sprint 1",
      relation: "current",
    },
    { path: "Project\\Sprint 2", name: "Sprint 2", label: "Next - Sprint 2", relation: "future" },
  ],
  currentName: "Sprint 1",
};

function member(displayName: string, uniqueName: string | null): TeamMember {
  return { id: `${displayName}-id`, displayName, uniqueName, imageUrl: null };
}

const roster = [member("Alice Smith", "alice@example.com"), member("Bob", null)];

describe("Sprint View URL preferences", () => {
  it("reads both preferences and trims their values", () => {
    expect(readSprintUrlPreferences("?sprint=%20Sprint%202%20&assignedTo=%20bob%20")).toEqual({
      sprint: "Sprint 2",
      assignedTo: ["bob"],
    });
  });

  it("reads several people from one list and from repeated parameters", () => {
    expect(readSprintUrlPreferences("?assignedTo=alice,,bob&assignedTo=unassigned")).toEqual({
      sprint: null,
      assignedTo: ["alice", "bob", "unassigned"],
    });
  });

  it("treats absent and blank parameters alike", () => {
    expect(readSprintUrlPreferences("?sprint=&other=1")).toEqual({
      sprint: null,
      assignedTo: [],
    });
    expect(readSprintUrlPreferences("")).toEqual({ sprint: null, assignedTo: [] });
  });
});

describe("Sprint View URL writing", () => {
  it("writes both selections beside the parameters ADO already carries", () => {
    const search = sprintSearchWith("?_a=query", {
      sprint: "Sprint 2",
      assignedTo: ["alice", "bob"],
    });

    expect(readSprintUrlPreferences(search)).toEqual({
      sprint: "Sprint 2",
      assignedTo: ["alice", "bob"],
    });
    expect(new URLSearchParams(search).get("_a")).toBe("query");
  });

  it("drops a parameter the board no longer has a selection for", () => {
    expect(
      sprintSearchWith("?sprint=Sprint%201&assignedTo=alice", { sprint: null, assignedTo: [] }),
    ).toBe("");
  });
});

describe("Sprint View requested sprint resolution", () => {
  it("accepts an exact name, a differently cased name, and a full iteration path", () => {
    expect(resolveSprintName(sprintWindow, "Sprint 2")).toBe("Sprint 2");
    expect(resolveSprintName(sprintWindow, "sprint 2")).toBe("Sprint 2");
    expect(resolveSprintName(sprintWindow, "project\\sprint 2")).toBe("Sprint 2");
  });

  it("reports no match for an absent request or a sprint outside the window", () => {
    expect(resolveSprintName(sprintWindow, null)).toBeNull();
    expect(resolveSprintName(sprintWindow, "Sprint 9")).toBeNull();
  });
});

describe("Sprint View requested assignee resolution", () => {
  it("matches an alias, a sign-in address, and a display name", () => {
    const matched = matchRequestedPeople(roster, ["ALICE", "alice@example.com", "alice smith"]);

    expect(matched.members.map((member) => member.displayName)).toEqual(["Alice Smith"]);
    expect(matched.includesUnassigned).toBe(false);
  });

  it("matches several people and the Unassigned bucket at once", () => {
    const matched = matchRequestedPeople(roster, ["alice", "bob", "unassigned"]);

    expect(matched.members.map((member) => member.id)).toEqual(["Alice Smith-id", "Bob-id"]);
    expect(matched.includesUnassigned).toBe(true);
  });

  it("reports nobody for an empty or unknown request", () => {
    expect(matchRequestedPeople(roster, [])).toEqual({ members: [], includesUnassigned: false });
    expect(matchRequestedPeople(roster, ["carol"]).members).toEqual([]);
  });

  it("names each selected person by the shortest alias that identifies them", () => {
    expect(urlAliasesFor(roster, true)).toEqual(["alice", "Bob", "unassigned"]);
    expect(urlAliasesFor([], false)).toEqual([]);
  });
});
