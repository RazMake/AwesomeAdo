import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import {
  SEARCH_ADO_IDENTITIES_MESSAGE,
  type SearchAdoIdentitiesMessage,
} from "./AdoIdentityRequest";
import { MessagingUserDirectory, type SendIdentitySearchRequest } from "./MessagingUserDirectory";

const ADA_BODY = {
  results: [{ identities: [{ displayName: "Ada Lovelace", signInAddress: "ada@example.com" }] }],
};

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function makeDirectory(send: SendIdentitySearchRequest): {
  directory: MessagingUserDirectory;
  logger: ILogger;
} {
  const logger = makeLoggerSpy();
  return { directory: new MessagingUserDirectory(send, logger), logger };
}

describe("MessagingUserDirectory - search", () => {
  it("sends the typed query and returns the parsed identities", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockResolvedValue({ raw: ADA_BODY });
    const { directory, logger } = makeDirectory(send);

    const users = await directory.search("ada");

    const message = send.mock.calls[0]?.[0] as SearchAdoIdentitiesMessage;
    expect(message).toEqual({ type: SEARCH_ADO_IDENTITIES_MESSAGE, query: "ada" });
    expect(users).toEqual([
      { displayName: "Ada Lovelace", uniqueName: "ada@example.com", imageUrl: null },
    ]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("answers a too-short query without a round-trip", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockResolvedValue({ raw: ADA_BODY });
    const { directory } = makeDirectory(send);

    expect(await directory.search("a")).toEqual([]);
    expect(await directory.search("   ")).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("serves a repeated query from the cache, case- and whitespace-insensitively", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockResolvedValue({ raw: ADA_BODY });
    const { directory } = makeDirectory(send);

    await directory.search("ada");
    const second = await directory.search("  ADA ");

    expect(send).toHaveBeenCalledTimes(1);
    expect(second).toHaveLength(1);
  });

  it("does not cache a failed round-trip, so a later search can still succeed", async () => {
    const send = vi
      .fn<SendIdentitySearchRequest>()
      .mockResolvedValueOnce({ raw: null })
      .mockResolvedValueOnce({ raw: ADA_BODY });
    const { directory, logger } = makeDirectory(send);

    expect(await directory.search("ada")).toEqual([]);
    expect(await directory.search("ada")).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalled();
  });

  it("degrades to an empty list and logs when the worker never replies", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockResolvedValue(undefined);
    const { directory } = makeDirectory(send);

    expect(await directory.search("ada")).toEqual([]);
  });

  it("degrades to an empty list and logs when the round-trip rejects", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockRejectedValue(new Error("no receiver"));
    const { directory, logger } = makeDirectory(send);

    expect(await directory.search("ada")).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("MessagingUserDirectory - resolve", () => {
  it("returns the identity whose display name matches exactly", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockResolvedValue({ raw: ADA_BODY });
    const { directory } = makeDirectory(send);

    const user = await directory.resolve("ada lovelace");

    expect(user?.uniqueName).toBe("ada@example.com");
  });

  it("returns the identity whose unique name matches exactly", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockResolvedValue({ raw: ADA_BODY });
    const { directory } = makeDirectory(send);

    expect((await directory.resolve("ADA@example.com"))?.displayName).toBe("Ada Lovelace");
  });

  it("returns null for a partial match rather than guessing", async () => {
    const send = vi.fn<SendIdentitySearchRequest>().mockResolvedValue({ raw: ADA_BODY });
    const { directory } = makeDirectory(send);

    expect(await directory.resolve("ada l")).toBeNull();
  });
});
