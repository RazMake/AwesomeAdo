import { describe, expect, it } from "vitest";

import { isLoadSprintCapacityMessage, LOAD_SPRINT_CAPACITY_MESSAGE } from "./AdoCapacityRequest";

describe("isLoadSprintCapacityMessage", () => {
  it("accepts the complete typed request", () => {
    expect(
      isLoadSprintCapacityMessage({
        type: LOAD_SPRINT_CAPACITY_MESSAGE,
        team: "Web",
        iterationId: "iteration-id",
      }),
    ).toBe(true);
  });

  it("rejects malformed and unrelated messages", () => {
    expect(isLoadSprintCapacityMessage(null)).toBe(false);
    expect(isLoadSprintCapacityMessage({ type: LOAD_SPRINT_CAPACITY_MESSAGE, team: "Web" })).toBe(
      false,
    );
    expect(isLoadSprintCapacityMessage({ type: "other", team: "Web", iterationId: "id" })).toBe(
      false,
    );
  });
});
