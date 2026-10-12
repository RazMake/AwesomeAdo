import { describe, expect, it, vi } from "vitest";

import {
  isLoadStateTransitionsMessage,
  LOAD_STATE_TRANSITIONS_MESSAGE,
  loadStateTransitionsMessageProblem,
} from "./AdoStateTransitionsRequest";
import { MessagingStateTransitionsReader } from "./MessagingStateTransitionsReader";
import { UNHANDLED_BY_WORKER } from "./workerReply";

describe("loadStateTransitionsMessageProblem", () => {
  it("accepts a named work item type", () => {
    const message = { type: LOAD_STATE_TRANSITIONS_MESSAGE, workItemType: "Task" };

    expect(loadStateTransitionsMessageProblem(message)).toBeNull();
    expect(isLoadStateTransitionsMessage(message)).toBe(true);
  });

  it("names what is wrong with a malformed message", () => {
    expect(loadStateTransitionsMessageProblem(null)).toBe("message is not an object");
    expect(loadStateTransitionsMessageProblem({ type: "other" })).toBe(
      `type is "other", expected "${LOAD_STATE_TRANSITIONS_MESSAGE}"`,
    );
    expect(
      loadStateTransitionsMessageProblem({
        type: LOAD_STATE_TRANSITIONS_MESSAGE,
        workItemType: "",
      }),
    ).toBe("workItemType must be a non-empty string");
  });
});

describe("MessagingStateTransitionsReader", () => {
  function reader(send: ConstructorParameters<typeof MessagingStateTransitionsReader>[0]) {
    const logger = { info: vi.fn(), error: vi.fn() };
    return { reader: new MessagingStateTransitionsReader(send, logger), logger };
  }

  it("asks the worker for the type and parses its transitions", async () => {
    const send = vi.fn().mockResolvedValue({
      raw: { transitions: { New: [{ to: "Active" }] } },
      status: 200,
    });
    const { reader: transitions } = reader(send);

    await expect(transitions.load("Task")).resolves.toEqual(new Map([["new", ["Active"]]]));
    expect(send).toHaveBeenCalledWith({
      type: LOAD_STATE_TRANSITIONS_MESSAGE,
      workItemType: "Task",
    });
  });

  it("logs and yields null when the worker returns nothing usable", async () => {
    const unanswered = reader(vi.fn().mockResolvedValue(undefined));
    const empty = reader(vi.fn().mockResolvedValue({ raw: null, status: 404 }));
    const refused = reader(vi.fn().mockResolvedValue({ raw: null, status: 0, error: "offline" }));

    await expect(unanswered.reader.load("Task")).resolves.toBeNull();
    await expect(empty.reader.load("Task")).resolves.toBeNull();
    await expect(refused.reader.load("Task")).resolves.toBeNull();
    expect(unanswered.logger.error).toHaveBeenCalledWith(
      `Could not load "Task" state transitions: ${UNHANDLED_BY_WORKER}.`,
    );
    expect(empty.logger.error).toHaveBeenCalledWith(
      'Could not load "Task" state transitions (HTTP 404, no transitions in the body).',
    );
    expect(refused.logger.error).toHaveBeenCalledWith(
      'Could not load "Task" state transitions (offline).',
    );
  });

  it("logs the thrown value when messaging fails", async () => {
    const failure = new Error("context invalidated");
    const { reader: transitions, logger } = reader(vi.fn().mockRejectedValue(failure));

    await expect(transitions.load("Task")).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith('Could not load "Task" state transitions', failure);
  });
});
