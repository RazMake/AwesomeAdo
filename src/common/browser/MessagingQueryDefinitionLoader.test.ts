import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import {
  MessagingQueryDefinitionLoader,
  type SendQueryDefinitionRequest,
} from "./MessagingQueryDefinitionLoader";

function setup(send: SendQueryDefinitionRequest): {
  loader: MessagingQueryDefinitionLoader;
  logger: ILogger;
} {
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  return { loader: new MessagingQueryDefinitionLoader(send, logger), logger };
}

describe("MessagingQueryDefinitionLoader", () => {
  it("loads and parses the original WIQL", async () => {
    const send = vi.fn<SendQueryDefinitionRequest>().mockResolvedValue({
      raw: { wiql: "SELECT [System.Id] FROM WorkItems" },
      status: 200,
    });
    const { loader, logger } = setup(send);

    await expect(loader.load("query-1")).resolves.toEqual({
      wiql: "SELECT [System.Id] FROM WorkItems",
      error: null,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs missing bodies and rejected messages", async () => {
    const missing = setup(
      vi.fn<SendQueryDefinitionRequest>().mockResolvedValue({ raw: null, status: 403 }),
    );
    await expect(missing.loader.load("query-1")).resolves.toEqual({
      wiql: null,
      error: "Could not load query definition (HTTP 403).",
    });
    expect(missing.logger.error).toHaveBeenCalledOnce();

    const failure = new Error("worker stopped");
    const rejected = setup(vi.fn<SendQueryDefinitionRequest>().mockRejectedValue(failure));
    await expect(rejected.loader.load("query-1")).resolves.toEqual({
      wiql: null,
      error: "Could not load query definition.",
    });
    expect(rejected.logger.error).toHaveBeenCalledWith("Could not load query definition.", failure);
  });

  it("distinguishes an unhandled worker from an HTTP or network response", async () => {
    const unhandled = setup(vi.fn<SendQueryDefinitionRequest>().mockResolvedValue(undefined));

    const result = await unhandled.loader.load("query-1");

    expect(result.error).toContain("background worker did not handle the request");
    expect(result.error).toContain("reload the extension, then the ADO tab");
    expect(unhandled.logger.error).toHaveBeenCalledWith(result.error);
  });

  it("preserves transport detail returned by the MAIN-world request", async () => {
    const network = setup(
      vi.fn<SendQueryDefinitionRequest>().mockResolvedValue({
        raw: null,
        status: 0,
        error: "network after 3 attempts: TypeError: Failed to fetch",
      }),
    );

    const result = await network.loader.load("query-1");

    expect(result.error).toBe(
      "Could not load query definition (network after 3 attempts: TypeError: Failed to fetch).",
    );
    expect(network.logger.error).toHaveBeenCalledWith(result.error);
  });
});
