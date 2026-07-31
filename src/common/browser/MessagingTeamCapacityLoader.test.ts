import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { LOAD_SPRINT_CAPACITY_MESSAGE } from "./AdoCapacityRequest";
import {
  MessagingTeamCapacityLoader,
  type SendCapacityRequest,
} from "./MessagingTeamCapacityLoader";

function makeLoader(send: SendCapacityRequest): {
  loader: MessagingTeamCapacityLoader;
  logger: ILogger;
} {
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  return { loader: new MessagingTeamCapacityLoader(send, logger), logger };
}

describe("MessagingTeamCapacityLoader", () => {
  it("sends team and iteration identifiers and parses the roster", async () => {
    const send = vi.fn<SendCapacityRequest>().mockResolvedValue({
      status: 200,
      raw: { value: [{ teamMember: { id: "1", displayName: "Alice" } }] },
    });
    const { loader, logger } = makeLoader(send);

    await expect(loader.loadCapacity("Web", "iteration-id")).resolves.toEqual({
      members: [{ id: "1", displayName: "Alice", uniqueName: null, imageUrl: null }],
      error: null,
    });
    expect(send).toHaveBeenCalledWith({
      type: LOAD_SPRINT_CAPACITY_MESSAGE,
      team: "Web",
      iterationId: "iteration-id",
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs and distinguishes an HTTP failure from an empty roster", async () => {
    const { loader, logger } = makeLoader(
      vi.fn<SendCapacityRequest>().mockResolvedValue({ raw: null, status: 403 }),
    );

    await expect(loader.loadCapacity("Web", "iteration-id")).resolves.toEqual({
      members: [],
      error: "Could not load sprint capacity (HTTP 403).",
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("logs missing replies and rejected requests", async () => {
    const missing = makeLoader(vi.fn<SendCapacityRequest>().mockResolvedValue(undefined));
    await expect(missing.loader.loadCapacity("Web", "id")).resolves.toEqual({
      members: [],
      error: "Could not load sprint capacity (HTTP 0).",
    });

    const rejected = makeLoader(
      vi.fn<SendCapacityRequest>().mockRejectedValue(new Error("worker stopped")),
    );
    await expect(rejected.loader.loadCapacity("Web", "id")).resolves.toEqual({
      members: [],
      error: "Could not load sprint capacity.",
    });
    expect(missing.logger.error).toHaveBeenCalledOnce();
    expect(rejected.logger.error).toHaveBeenCalledOnce();
  });
});
