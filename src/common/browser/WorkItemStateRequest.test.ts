import { describe, expect, it } from "vitest";

import {
  isUpdateWorkItemStateMessage,
  UPDATE_WORK_ITEM_STATE_MESSAGE,
} from "./WorkItemStateRequest";

describe("isUpdateWorkItemStateMessage", () => {
  it("accepts a valid message", () => {
    expect(
      isUpdateWorkItemStateMessage({
        type: UPDATE_WORK_ITEM_STATE_MESSAGE,
        id: 123,
        rev: 5,
        state: "Active",
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isUpdateWorkItemStateMessage(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isUpdateWorkItemStateMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(isUpdateWorkItemStateMessage({ type: "other", id: 123, rev: 5, state: "Active" })).toBe(
      false,
    );
  });

  it("rejects a missing id", () => {
    expect(
      isUpdateWorkItemStateMessage({
        type: UPDATE_WORK_ITEM_STATE_MESSAGE,
        rev: 5,
        state: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a non-number id", () => {
    expect(
      isUpdateWorkItemStateMessage({
        type: UPDATE_WORK_ITEM_STATE_MESSAGE,
        id: "123",
        rev: 5,
        state: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a missing rev", () => {
    expect(
      isUpdateWorkItemStateMessage({
        type: UPDATE_WORK_ITEM_STATE_MESSAGE,
        id: 123,
        state: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a non-number rev", () => {
    expect(
      isUpdateWorkItemStateMessage({
        type: UPDATE_WORK_ITEM_STATE_MESSAGE,
        id: 123,
        rev: "5",
        state: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a missing state", () => {
    expect(
      isUpdateWorkItemStateMessage({
        type: UPDATE_WORK_ITEM_STATE_MESSAGE,
        id: 123,
        rev: 5,
      }),
    ).toBe(false);
  });

  it("rejects a non-string state", () => {
    expect(
      isUpdateWorkItemStateMessage({
        type: UPDATE_WORK_ITEM_STATE_MESSAGE,
        id: 123,
        rev: 5,
        state: 42,
      }),
    ).toBe(false);
  });
});
