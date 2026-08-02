import { describe, expect, it } from "vitest";

import {
  isReadTeamConfigMessage,
  isReadTeamConfigResponse,
  isWriteTeamConfigMessage,
  READ_TEAM_CONFIG_MESSAGE,
  WRITE_TEAM_CONFIG_MESSAGE,
} from "./TeamConfigRequest";

describe("team configuration message guards", () => {
  it("accepts only positive safe work item ids", () => {
    expect(isReadTeamConfigMessage({ type: READ_TEAM_CONFIG_MESSAGE, workItemId: 42 })).toBe(true);
    expect(isReadTeamConfigMessage({ type: READ_TEAM_CONFIG_MESSAGE, workItemId: 0 })).toBe(false);
    expect(isReadTeamConfigMessage({ type: READ_TEAM_CONFIG_MESSAGE, workItemId: "42" })).toBe(
      false,
    );
  });

  it("accepts only bounded team configuration writes", () => {
    expect(
      isWriteTeamConfigMessage({
        type: WRITE_TEAM_CONFIG_MESSAGE,
        workItemId: 42,
        text: "{}",
      }),
    ).toBe(true);
    expect(
      isWriteTeamConfigMessage({
        type: WRITE_TEAM_CONFIG_MESSAGE,
        workItemId: 42,
        text: "x".repeat(1_000_001),
      }),
    ).toBe(false);
  });

  it("accepts both typed response outcomes", () => {
    expect(isReadTeamConfigResponse({ ok: true, text: "{}" })).toBe(true);
    expect(isReadTeamConfigResponse({ ok: true, text: null })).toBe(true);
    expect(isReadTeamConfigResponse({ ok: false, error: "HTTP 404" })).toBe(true);
    expect(isReadTeamConfigResponse({ ok: true, error: "wrong member" })).toBe(false);
  });
});
