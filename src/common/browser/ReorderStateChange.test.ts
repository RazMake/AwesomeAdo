import { describe, expect, it, vi } from "vitest";

import { prepareReorderState, withPreparedState } from "./ReorderStateChange";
import { REORDER_WORK_ITEM_MESSAGE, type ReorderWorkItemMessage } from "./WorkItemReorderRequest";

const message = (overrides: Partial<ReorderWorkItemMessage> = {}): ReorderWorkItemMessage => ({
  type: REORDER_WORK_ITEM_MESSAGE,
  id: 123,
  rev: 5,
  parentId: 10,
  currentParentId: 10,
  previousId: 1,
  nextId: 2,
  siblingIds: [1, 123, 2],
  team: "Web",
  ...overrides,
});

describe("prepareReorderState", () => {
  it("leaves a rank-only request untouched", async () => {
    const writeState = vi.fn();
    const original = message();

    const result = await prepareReorderState(original, writeState);

    expect(result).toEqual({ ok: true, message: original, stateChanged: false });
    expect(writeState).not.toHaveBeenCalled();
  });

  it("writes System.State with its base value and carries the returned rev", async () => {
    const writeState = vi.fn().mockResolvedValue({ ok: true, rev: 6 });

    const result = await prepareReorderState(
      message({ stateName: "Active", stateBaseName: "New" }),
      writeState,
    );

    expect(writeState).toHaveBeenCalledWith({
      type: "awesomeado:update-work-item-field",
      id: 123,
      rev: 5,
      field: "System.State",
      value: "Active",
      baseValue: "New",
    });
    expect(result).toMatchObject({ ok: true, stateChanged: true, message: { rev: 6 } });
    if (result.ok) {
      expect(result.message.stateName).toBeUndefined();
      expect(result.message.stateBaseName).toBeUndefined();
    }
  });

  it("stops before ranking when the state patch fails", async () => {
    const result = await prepareReorderState(
      message({ stateName: "Active", stateBaseName: "New" }),
      async () => ({ ok: false, error: "HTTP 412" }),
    );

    expect(result).toEqual({
      ok: false,
      response: { ok: false, error: "state HTTP 412", stage: "state" },
    });
  });
});

describe("withPreparedState", () => {
  it("reports a landed state and its rev when ranking later fails", async () => {
    const preparation = await prepareReorderState(
      message({ stateName: "Active", stateBaseName: "New" }),
      async () => ({ ok: true, rev: 6 }),
    );
    expect(preparation.ok).toBe(true);
    if (!preparation.ok) return;

    expect(withPreparedState({ ok: false, error: "order HTTP 500" }, preparation)).toEqual({
      ok: false,
      error: "order HTTP 500",
      rev: 6,
      stateChanged: true,
    });
  });
});
