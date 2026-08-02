import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { MessagingInterruptAcceptanceReader } from "./MessagingInterruptAcceptanceReader";

function logger(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

const request = {
  workItemIds: [1, 2],
  interruptTag: "Interrupt",
  acceptanceTag: "[ACCEPTED]",
};

describe("MessagingInterruptAcceptanceReader", () => {
  it("returns accepted ids while preserving partial failures", async () => {
    const reader = new MessagingInterruptAcceptanceReader(
      async () => ({
        raw: {
          evidence: [
            {
              workItemId: 1,
              taggedAt: "2026-08-01T10:00:00Z",
              notes: [{ text: "[ACCEPTED]", createdDate: "2026-08-01T10:00:00Z" }],
            },
          ],
          failedIds: [2],
          failure: "http",
          status: 403,
        },
      }),
      logger(),
    );

    await expect(reader.readInterruptAcceptance(request)).resolves.toEqual({
      acceptedWorkItemIds: [1],
      failedWorkItemIds: [2],
      error: "http (HTTP 403)",
    });
  });

  it("skips an empty item list without messaging the worker", async () => {
    const send = vi.fn();
    const reader = new MessagingInterruptAcceptanceReader(send, logger());

    await expect(reader.readInterruptAcceptance({ ...request, workItemIds: [] })).resolves.toEqual({
      acceptedWorkItemIds: [],
      failedWorkItemIds: [],
      error: null,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("marks every requested item failed when the worker does not answer", async () => {
    const reader = new MessagingInterruptAcceptanceReader(async () => undefined, logger());

    const result = await reader.readInterruptAcceptance(request);

    expect(result.acceptedWorkItemIds).toEqual([]);
    expect(result.failedWorkItemIds).toEqual([1, 2]);
    expect(result.error).not.toBeNull();
  });
});
