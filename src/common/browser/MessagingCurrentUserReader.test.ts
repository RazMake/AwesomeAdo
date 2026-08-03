import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import {
  isReadCurrentUserMessage,
  READ_CURRENT_USER_MESSAGE,
  type ReadCurrentUserResponse,
} from "./CurrentUserRequest";
import { MessagingCurrentUserReader } from "./MessagingCurrentUserReader";
import { UNHANDLED_BY_WORKER } from "./workerReply";

const logger = (): ILogger => ({ info: vi.fn(), error: vi.fn() });

const CONNECTION = {
  authenticatedUser: {
    id: "guid-one",
    providerDisplayName: "Alice Smith",
    properties: { Account: { $value: "alice@example.com" } },
  },
};

describe("isReadCurrentUserMessage", () => {
  it("claims only its own message type", () => {
    expect(isReadCurrentUserMessage({ type: READ_CURRENT_USER_MESSAGE })).toBe(true);
    expect(isReadCurrentUserMessage({ type: "something-else" })).toBe(false);
    expect(isReadCurrentUserMessage(null)).toBe(false);
    expect(isReadCurrentUserMessage("nope")).toBe(false);
  });
});

describe("MessagingCurrentUserReader", () => {
  it("parses the identity out of the body the worker returned", async () => {
    const send = vi.fn(async (): Promise<ReadCurrentUserResponse> => ({
      raw: CONNECTION,
      status: 200,
    }));

    await expect(new MessagingCurrentUserReader(send, logger()).readCurrentUser()).resolves.toEqual(
      { displayName: "Alice Smith", id: "guid-one", uniqueName: "alice@example.com" },
    );
    expect(send).toHaveBeenCalledWith({ type: READ_CURRENT_USER_MESSAGE });
  });

  it("records the failure and reports no identity when the read did not succeed", async () => {
    const log = logger();
    const send = vi.fn(async (): Promise<ReadCurrentUserResponse> => ({
      raw: null,
      status: 401,
      error: "HTTP 401",
    }));

    await expect(new MessagingCurrentUserReader(send, log).readCurrentUser()).resolves.toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("HTTP 401"));
  });

  it("blames the worker, not the network, when no listener claimed the message", async () => {
    // The live symptom of a service worker running older code than the page. Reported as itself so
    // the reader is told to reload the extension instead of hunting an Azure DevOps fault.
    const log = logger();
    const send = vi.fn(async () => undefined);

    await expect(new MessagingCurrentUserReader(send, log).readCurrentUser()).resolves.toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining(UNHANDLED_BY_WORKER));
  });

  it("says so when Azure DevOps answered but named nobody", async () => {
    const log = logger();
    const send = vi.fn(async (): Promise<ReadCurrentUserResponse> => ({ raw: {}, status: 200 }));

    await expect(new MessagingCurrentUserReader(send, log).readCurrentUser()).resolves.toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("no signed-in user"));
  });

  it("records a rejected round trip instead of letting it escape", async () => {
    const log = logger();
    const send = vi.fn(async () => {
      throw new Error("no receiver");
    });

    await expect(new MessagingCurrentUserReader(send, log).readCurrentUser()).resolves.toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      "Could not read the signed-in Azure DevOps identity",
      expect.any(Error),
    );
  });
});
