import { describe, expect, it } from "vitest";

import type { WorkItemReorderRequest } from "../ado/IWorkItemReorderWriter";
import type { ILogger } from "../logging/ILogger";

import {
  MessagingWorkItemReorderWriter,
  type SendReorderRequest,
} from "./MessagingWorkItemReorderWriter";
import {
  REORDER_WORK_ITEM_MESSAGE,
  type ReorderWorkItemMessage,
  type ReorderWorkItemResponse,
} from "./WorkItemReorderRequest";

/** A logger that records what it was told, so tests can assert on the diagnostics trail. */
function createRecordingLogger(): {
  logger: ILogger;
  infos: string[];
  errors: Array<{ message: string; error?: unknown }>;
} {
  const infos: string[] = [];
  const errors: Array<{ message: string; error?: unknown }> = [];
  return {
    logger: {
      info: (message) => infos.push(message),
      error: (message, error) => errors.push({ message, error }),
    },
    infos,
    errors,
  };
}

const REQUEST: WorkItemReorderRequest = {
  id: 123,
  rev: 5,
  parentId: 20,
  currentParentId: 10,
  previousId: 3,
  nextId: 4,
  siblingIds: [3, 123, 4],
  team: "Web",
};

/** Builds a writer over a `send` that records its calls and returns a canned reply. */
function makeWriter(reply: () => Promise<ReorderWorkItemResponse | undefined>): {
  writer: MessagingWorkItemReorderWriter;
  sent: ReorderWorkItemMessage[];
  infos: string[];
  errors: Array<{ message: string; error?: unknown }>;
} {
  const sent: ReorderWorkItemMessage[] = [];
  const send: SendReorderRequest = (message) => {
    sent.push(message);
    return reply();
  };
  const { logger, infos, errors } = createRecordingLogger();
  return { writer: new MessagingWorkItemReorderWriter(send, logger), sent, infos, errors };
}

describe("MessagingWorkItemReorderWriter - success", () => {
  it("forwards a destination type with the hierarchy move", async () => {
    const { writer, sent } = makeWriter(() => Promise.resolve({ ok: true }));

    await writer.reorder({ ...REQUEST, type: "Feature" });

    expect(sent[0]?.typeName).toBe("Feature");
  });

  it("forwards a destination state with the positioned move", async () => {
    const { writer, sent } = makeWriter(() => Promise.resolve({ ok: true }));

    await writer.reorder({ ...REQUEST, stateName: "Active", stateBaseName: "New" });

    expect(sent[0]?.stateName).toBe("Active");
    expect(sent[0]?.stateBaseName).toBe("New");
  });

  it("sends the whole request as one reorder message", async () => {
    const { writer, sent } = makeWriter(() => Promise.resolve({ ok: true }));

    await writer.reorder(REQUEST);

    expect(sent).toEqual([
      {
        type: REORDER_WORK_ITEM_MESSAGE,
        id: 123,
        rev: 5,
        parentId: 20,
        currentParentId: 10,
        previousId: 3,
        nextId: 4,
        siblingIds: [3, 123, 4],
        team: "Web",
      },
    ]);
  });

  it("forwards the order and rev the background reported", async () => {
    const { writer, errors } = makeWriter(() => Promise.resolve({ ok: true, order: 1500, rev: 6 }));

    const result = await writer.reorder(REQUEST);

    expect(result).toEqual({
      ok: true,
      order: 1500,
      rev: 6,
      ranks: undefined,
      reparented: undefined,
    });
    expect(errors).toEqual([]);
  });

  it("forwards the ranks the worker wrote when ADO refused to order the item itself", async () => {
    const ranks = [
      { id: 3, rank: 100000 },
      { id: 123, rank: 200000 },
    ];
    const { writer } = makeWriter(() => Promise.resolve({ ok: true, order: 200000, ranks }));

    const result = await writer.reorder(REQUEST);

    // The whole level's ranks travel, not just the moved item's: a renumber changes siblings the
    // user never dragged, and a board that refreshed only one would re-sort against stale numbers.
    expect(result.ranks).toEqual(ranks);
  });

  it("reports success even when the background reported no new order or rev", async () => {
    const { writer } = makeWriter(() => Promise.resolve({ ok: true }));

    expect(await writer.reorder(REQUEST)).toEqual({
      ok: true,
      order: undefined,
      rev: undefined,
      ranks: undefined,
      reparented: undefined,
    });
  });

  it("logs the move's signals and outcome using ids alone, never a work item title", async () => {
    const { writer, infos } = makeWriter(() => Promise.resolve({ ok: true, order: 1500 }));

    await writer.reorder(REQUEST);

    expect(infos).toEqual(["Work item 123 moved: parent 10→20, between 3 and 4, order=1500."]);
  });

  it("records an unchanged order rather than inventing one when none came back", async () => {
    const { writer, infos } = makeWriter(() => Promise.resolve({ ok: true }));

    await writer.reorder(REQUEST);

    expect(infos[0]).toContain("order=unchanged");
  });
});

describe("MessagingWorkItemReorderWriter - failure", () => {
  it("reports the background's error and logs it", async () => {
    const { writer, infos, errors } = makeWriter(() =>
      Promise.resolve({ ok: false, error: "order HTTP 409" }),
    );

    const result = await writer.reorder(REQUEST);

    expect(result).toEqual({ ok: false, error: "order HTTP 409", reparented: undefined });
    // The reason is passed as the log's detail as well as inlined in the message, so the Diagnostics
    // view shows it on its own line rather than only inside a sentence.
    expect(errors).toEqual([
      { message: "Work item 123 reorder failed: order HTTP 409.", error: "order HTTP 409" },
    ]);
    expect(infos).toEqual([]);
  });

  it("explains a TF400486 refusal beside ADO's own words instead of replacing them", async () => {
    const { writer, errors } = makeWriter(() =>
      Promise.resolve({ ok: false, error: "order HTTP 400: TF400486: Unable to complete…" }),
    );

    await writer.reorder(REQUEST);

    // TF400486 reads as a concurrency complaint, which it is not; the raw code stays first so the
    // log is still searchable, and the explanation follows so nobody chases a race that is not there.
    expect(errors[0]?.message).toContain("TF400486");
    expect(errors[1]?.message).toContain("no backlog position");
    expect(errors[1]?.message).toContain("retrying cannot clear it");
  });

  it("adds no explanation to a failure Azure DevOps already stated plainly", async () => {
    const { writer, errors } = makeWriter(() =>
      Promise.resolve({ ok: false, error: "order HTTP 401" }),
    );

    await writer.reorder(REQUEST);

    expect(errors).toHaveLength(1);
  });

  it("reports a landed re-parent even when the move then failed to rank the item", async () => {
    const { writer } = makeWriter(() =>
      Promise.resolve({ ok: false, error: "order HTTP 400", reparented: true }),
    );

    // ADO has already re-linked the item, so a caller that left its tree untouched would keep
    // showing a parent that no longer holds it and resend the same rejected move.
    expect((await writer.reorder(REQUEST)).reparented).toBe(true);
  });

  it("logs 'unknown error' when the failed response carries no description", async () => {
    const { writer, errors } = makeWriter(() => Promise.resolve({ ok: false }));

    const result = await writer.reorder(REQUEST);

    expect(result).toEqual({ ok: false, error: undefined, reparented: undefined });
    expect(errors[0]?.message).toBe("Work item 123 reorder failed: unknown error.");
  });

  it("fails and logs what it sent when the background answered nothing at all", async () => {
    const { writer, errors } = makeWriter(() => Promise.resolve(undefined));

    const result = await writer.reorder(REQUEST);

    expect(result).toEqual({ ok: false, error: "no response from the background worker" });
    // Silence is the hardest failure to act on, so the line has to carry what was sent and the most
    // likely cause — a worker that predates the feature — or there is nothing to go on but a repro.
    expect(errors[0]?.message).toContain("no response from the background worker");
    expect(errors[0]?.message).toContain("rev 5");
    expect(errors[0]?.message).toContain("team set");
    expect(errors[0]?.message).toContain("reload the extension");
  });

  it("reports a missing team in the no-response line, since it is the likeliest cause", async () => {
    const { writer, errors } = makeWriter(() => Promise.resolve(undefined));

    await writer.reorder({ ...REQUEST, team: "" });

    expect(errors[0]?.message).toContain("team MISSING");
  });

  it("treats a null response the same as no response", async () => {
    const { writer, errors } = makeWriter(() => Promise.resolve(null as never));

    const result = await writer.reorder(REQUEST);

    expect(result).toEqual({ ok: false, error: "no response from the background worker" });
    expect(errors).toHaveLength(1);
  });

  it("fails and logs the thrown value when the send itself rejects", async () => {
    const thrown = new Error("Receiving end does not exist");
    const { writer, infos, errors } = makeWriter(() => Promise.reject(thrown));

    const result = await writer.reorder(REQUEST);

    expect(result).toEqual({ ok: false, error: "reorder request threw" });
    expect(errors).toEqual([{ message: "Could not reorder work item 123", error: thrown }]);
    expect(infos).toEqual([]);
  });
});
