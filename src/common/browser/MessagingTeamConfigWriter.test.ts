import { describe, expect, it, vi } from "vitest";

import { MessagingTeamConfigWriter } from "./MessagingTeamConfigWriter";
import { WRITE_TEAM_CONFIG_MESSAGE } from "./TeamConfigRequest";

describe("MessagingTeamConfigWriter", () => {
  it("forwards a bounded publish request", async () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    const writer = new MessagingTeamConfigWriter(send);

    await expect(writer.write(42, "{}")).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({
      type: WRITE_TEAM_CONFIG_MESSAGE,
      workItemId: 42,
      text: "{}",
    });
  });

  it("reports an invalid worker response", async () => {
    const writer = new MessagingTeamConfigWriter(async () => undefined);

    await expect(writer.write(42, "{}")).resolves.toEqual({
      ok: false,
      error: "The background worker returned no valid publish response.",
    });
  });
});
