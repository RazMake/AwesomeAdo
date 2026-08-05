import { describe, expect, it, vi } from "vitest";

import { CREATE_WORK_ITEM_MESSAGE } from "./CreateWorkItemRequest";
import {
  MessagingWorkItemCreator,
  type SendCreateWorkItemRequest,
} from "./MessagingWorkItemCreator";

function logger() {
  return {
    info: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string, error?: unknown) => void>(),
  };
}

const NEW_ITEM = {
  type: "Epic",
  title: "Payments",
  tags: ["Catalog"],
  areaPath: "Fabrikam\\Core",
  iterationPath: "Fabrikam\\Backlog",
};

describe("MessagingWorkItemCreator", () => {
  it("forwards the item to the worker and reports what it created", async () => {
    const send = vi.fn(async () => ({ ok: true, id: 42, rev: 1 })) as SendCreateWorkItemRequest;
    const log = logger();

    const result = await new MessagingWorkItemCreator(send, log).create(NEW_ITEM);

    expect(send).toHaveBeenCalledWith({
      type: CREATE_WORK_ITEM_MESSAGE,
      itemType: "Epic",
      title: "Payments",
      tags: ["Catalog"],
      areaPath: "Fabrikam\\Core",
      iterationPath: "Fabrikam\\Backlog",
      assignedTo: null,
      description: null,
      comment: null,
      parentId: null,
    });
    expect(result).toEqual({ ok: true, id: 42, rev: 1 });
    // The title is never logged: the diagnostics log is exported with bug reports.
    expect(log.info.mock.calls[0]?.[0]).not.toContain("Payments");
  });

  it("names the parent a child item is born under", async () => {
    const send = vi.fn(async () => ({ ok: true, id: 42, rev: 1 })) as SendCreateWorkItemRequest;

    await new MessagingWorkItemCreator(send, logger()).create({ ...NEW_ITEM, parentId: 7 });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ parentId: 7 }));
  });

  it("carries the assignee, description and reason a form filled in", async () => {
    const send = vi.fn(async () => ({ ok: true, id: 42, rev: 1 })) as SendCreateWorkItemRequest;

    await new MessagingWorkItemCreator(send, logger()).create({
      ...NEW_ITEM,
      assignedTo: "ada@example.com",
      description: "Card capture fails on retry.",
      comment: "[Accepted] Customer escalation.",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: "ada@example.com",
        description: "Card capture fails on retry.",
        comment: "[Accepted] Customer escalation.",
      }),
    );
  });

  it("reports and records a worker that never answered", async () => {
    const send = vi.fn(async () => undefined) as SendCreateWorkItemRequest;
    const log = logger();

    const result = await new MessagingWorkItemCreator(send, log).create(NEW_ITEM);

    expect(result.ok).toBe(false);
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("reports and records a refusal the worker explained", async () => {
    const send = vi.fn(async () => ({ ok: false, error: "HTTP 403" })) as SendCreateWorkItemRequest;
    const log = logger();

    const result = await new MessagingWorkItemCreator(send, log).create(NEW_ITEM);

    expect(result).toEqual({ ok: false, error: "HTTP 403" });
    expect(log.error.mock.calls[0]?.[0]).toContain("HTTP 403");
  });

  it("never lets a rejected round trip escape as an exception", async () => {
    const send = vi.fn(async () => {
      throw new Error("port closed");
    }) as unknown as SendCreateWorkItemRequest;
    const log = logger();

    const result = await new MessagingWorkItemCreator(send, log).create(NEW_ITEM);

    expect(result.ok).toBe(false);
    expect(log.error).toHaveBeenCalledOnce();
  });
});
