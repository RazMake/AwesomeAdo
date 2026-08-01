import { describe, expect, it } from "vitest";

import {
  isLoadTeamMembersMessage,
  LOAD_TEAM_MEMBERS_MESSAGE,
  loadTeamMembersMessageProblem,
} from "./AdoTeamMembersRequest";

describe("loadTeamMembersMessageProblem", () => {
  it("accepts a team-members request", () => {
    const message = { type: LOAD_TEAM_MEMBERS_MESSAGE, team: "team-id" };
    expect(loadTeamMembersMessageProblem(message)).toBeNull();
    expect(isLoadTeamMembersMessage(message)).toBe(true);
  });

  it("describes malformed requests", () => {
    expect(loadTeamMembersMessageProblem(null)).toBe("message is not an object");
    expect(loadTeamMembersMessageProblem({ type: LOAD_TEAM_MEMBERS_MESSAGE, team: " " })).toBe(
      "team must be a non-empty string",
    );
    expect(isLoadTeamMembersMessage({ type: "other", team: "team-id" })).toBe(false);
  });
});
