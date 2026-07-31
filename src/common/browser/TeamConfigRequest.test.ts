import { describe, expect, it } from "vitest";

import {
  isReadTeamConfigMessage,
  isReadTeamConfigResponse,
  READ_TEAM_CONFIG_MESSAGE,
} from "./TeamConfigRequest";

describe("team configuration message guards", () => {
  it("accepts only positive safe work item ids", () => {
    expect(isReadTeamConfigMessage({ type: READ_TEAM_CONFIG_MESSAGE, workItemId: 42 })).toBe(true);
    expect(isReadTeamConfigMessage({ type: READ_TEAM_CONFIG_MESSAGE, workItemId: 0 })).toBe(false);
    expect(isReadTeamConfigMessage({ type: READ_TEAM_CONFIG_MESSAGE, workItemId: "42" })).toBe(
      false,
    );
  });

  it("accepts both typed response outcomes", () => {
    expect(isReadTeamConfigResponse({ ok: true, text: "{}" })).toBe(true);
    expect(isReadTeamConfigResponse({ ok: true, text: null })).toBe(true);
    expect(isReadTeamConfigResponse({ ok: false, error: "HTTP 404" })).toBe(true);
    expect(isReadTeamConfigResponse({ ok: true, error: "wrong member" })).toBe(false);
  });
});
