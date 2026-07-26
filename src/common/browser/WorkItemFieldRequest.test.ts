import { describe, expect, it } from "vitest";

import {
  isUpdateWorkItemFieldMessage,
  UPDATE_WORK_ITEM_FIELD_MESSAGE,
} from "./WorkItemFieldRequest";

describe("isUpdateWorkItemFieldMessage - type and id", () => {
  it("accepts a valid message", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        field: "System.State",
        value: "Active",
      }),
    ).toBe(true);
  });

  it("accepts a cleared value (null)", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        field: "Microsoft.VSTS.Scheduling.TargetDate",
        value: null,
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isUpdateWorkItemFieldMessage(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isUpdateWorkItemFieldMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: "other",
        id: 123,
        rev: 5,
        field: "System.State",
        value: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        rev: 5,
        field: "System.State",
        value: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a non-number id", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: "123",
        rev: 5,
        field: "System.State",
        value: "Active",
      }),
    ).toBe(false);
  });
});

describe("isUpdateWorkItemFieldMessage - rev, field and value", () => {
  it("rejects a missing rev", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        field: "System.State",
        value: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a non-number rev", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: "5",
        field: "System.State",
        value: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        value: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a non-string field", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        field: 42,
        value: "Active",
      }),
    ).toBe(false);
  });

  it("rejects a missing value", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        field: "System.State",
      }),
    ).toBe(false);
  });

  it("rejects a value that is neither a string nor null", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        field: "System.State",
        value: 42,
      }),
    ).toBe(false);
  });
});
