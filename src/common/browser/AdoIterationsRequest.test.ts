import { describe, expect, it } from "vitest";

import { isLoadTeamIterationsMessage, LOAD_TEAM_ITERATIONS_MESSAGE } from "./AdoIterationsRequest";

describe("isLoadTeamIterationsMessage", () => {
  it("accepts a valid message", () => {
    expect(
      isLoadTeamIterationsMessage({ type: LOAD_TEAM_ITERATIONS_MESSAGE, team: "Web Team" }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isLoadTeamIterationsMessage(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isLoadTeamIterationsMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(isLoadTeamIterationsMessage({ type: "other", team: "Web Team" })).toBe(false);
  });

  it("rejects a non-string team", () => {
    expect(isLoadTeamIterationsMessage({ type: LOAD_TEAM_ITERATIONS_MESSAGE, team: 5 })).toBe(
      false,
    );
  });
});
