import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { LOAD_TEAM_MEMBERS_MESSAGE } from "./AdoTeamMembersRequest";
import {
  MessagingTeamMembersLoader,
  type SendTeamMembersRequest,
} from "./MessagingTeamMembersLoader";

function makeLoader(send: SendTeamMembersRequest): {
  loader: MessagingTeamMembersLoader;
  logger: ILogger;
} {
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  return { loader: new MessagingTeamMembersLoader(send, logger), logger };
}

describe("MessagingTeamMembersLoader", () => {
  it("logs access, sends the team identifier, and parses the roster", async () => {
    const send = vi.fn<SendTeamMembersRequest>().mockResolvedValue({
      status: 200,
      raw: { value: [{ identity: { id: "1", displayName: "Alice" } }] },
    });
    const { loader, logger } = makeLoader(send);

    await expect(loader.loadMembers("team-id")).resolves.toEqual({
      members: [{ id: "1", displayName: "Alice", uniqueName: null, imageUrl: null }],
      error: null,
    });
    expect(send).toHaveBeenCalledWith({ type: LOAD_TEAM_MEMBERS_MESSAGE, team: "team-id" });
    expect(logger.info).toHaveBeenCalledWith("Team-members read requested for team team-id.");
    expect(logger.info).toHaveBeenLastCalledWith("Team-members read completed: members=1.");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs the worker's HTTP or transport detail", async () => {
    const { loader, logger } = makeLoader(
      vi.fn<SendTeamMembersRequest>().mockResolvedValue({
        raw: null,
        status: 403,
        error: "HTTP 403",
      }),
    );

    await expect(loader.loadMembers("team-id")).resolves.toEqual({
      members: [],
      error: "Could not load team members (HTTP 403).",
    });
    expect(logger.error).toHaveBeenCalledWith("Could not load team members (HTTP 403).");
  });

  it("logs stale-worker and rejected-request details", async () => {
    const missing = makeLoader(vi.fn<SendTeamMembersRequest>().mockResolvedValue(undefined));
    await expect(missing.loader.loadMembers("team-id")).resolves.toEqual({
      members: [],
      error: expect.stringContaining("background worker did not handle the request"),
    });

    const failure = new Error("worker stopped");
    const rejected = makeLoader(vi.fn<SendTeamMembersRequest>().mockRejectedValue(failure));
    await expect(rejected.loader.loadMembers("team-id")).resolves.toEqual({
      members: [],
      error: "Could not load team members: request rejected.",
    });
    expect(missing.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("background worker did not handle the request"),
    );
    expect(rejected.logger.error).toHaveBeenCalledWith(
      "Could not load team members: request rejected.",
      failure,
    );
  });
});
