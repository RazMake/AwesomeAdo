import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import {
  LOAD_TEAM_ITERATIONS_MESSAGE,
  type LoadTeamIterationsMessage,
} from "./AdoIterationsRequest";
import {
  MessagingTeamIterationsLoader,
  type SendIterationsRequest,
} from "./MessagingTeamIterationsLoader";

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function makeLoader(send: SendIterationsRequest): {
  loader: MessagingTeamIterationsLoader;
  logger: ILogger;
} {
  const logger = makeLoggerSpy();
  return { loader: new MessagingTeamIterationsLoader(send, logger), logger };
}

describe("MessagingTeamIterationsLoader", () => {
  it("sends the team name and returns the parsed iterations on success", async () => {
    const raw = {
      value: [
        { name: "Sprint 1", path: "P\\Sprint 1", attributes: { timeFrame: "current" } },
        { name: "Sprint 2", path: "P\\Sprint 2", attributes: { timeFrame: "future" } },
      ],
    };
    const send = vi.fn<SendIterationsRequest>().mockResolvedValue({ raw });
    const { loader, logger } = makeLoader(send);

    const iterations = await loader.loadIterations("Web Team");

    const message = send.mock.calls[0]?.[0] as LoadTeamIterationsMessage;
    expect(message).toEqual({ type: LOAD_TEAM_ITERATIONS_MESSAGE, team: "Web Team" });
    expect(iterations).toEqual([
      { name: "Sprint 1", path: "P\\Sprint 1", timeFrame: "current" },
      { name: "Sprint 2", path: "P\\Sprint 2", timeFrame: "future" },
    ]);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it("returns an empty list and logs when the response has no data", async () => {
    const send = vi.fn<SendIterationsRequest>().mockResolvedValue({ raw: null });
    const { loader, logger } = makeLoader(send);

    expect(await loader.loadIterations("Web Team")).toEqual([]);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("returns an empty list and logs when the response is undefined", async () => {
    const send = vi.fn<SendIterationsRequest>().mockResolvedValue(undefined);
    const { loader, logger } = makeLoader(send);

    expect(await loader.loadIterations("Web Team")).toEqual([]);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("returns an empty list and logs when the send rejects", async () => {
    const send = vi.fn<SendIterationsRequest>().mockRejectedValue(new Error("boom"));
    const { loader, logger } = makeLoader(send);

    expect(await loader.loadIterations("Web Team")).toEqual([]);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
