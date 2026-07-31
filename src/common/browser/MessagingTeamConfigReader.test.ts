import { describe, expect, it, vi } from "vitest";

import { MessagingTeamConfigReader } from "./MessagingTeamConfigReader";
import { READ_TEAM_CONFIG_MESSAGE } from "./TeamConfigRequest";

describe("MessagingTeamConfigReader", () => {
  it("sends the typed request and returns its response", async () => {
    const send = vi.fn(async () => ({ ok: true as const, text: "config" }));
    const reader = new MessagingTeamConfigReader(send);

    await expect(reader.read(42)).resolves.toEqual({ ok: true, text: "config" });
    expect(send).toHaveBeenCalledWith({ type: READ_TEAM_CONFIG_MESSAGE, workItemId: 42 });
  });

  it("turns missing and rejected replies into failures", async () => {
    const send = vi.fn(async () => undefined);
    const reader = new MessagingTeamConfigReader(send);
    await expect(reader.read(42)).resolves.toEqual({
      ok: false,
      error: "The background worker returned no valid response.",
    });

    send.mockRejectedValueOnce(new Error("port closed"));
    await expect(reader.read(42)).resolves.toEqual({ ok: false, error: "port closed" });
  });
});
