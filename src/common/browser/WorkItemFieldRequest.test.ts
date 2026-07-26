import { describe, expect, it } from "vitest";

import {
  isFieldReferenceName,
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

  it("rejects an id that is not a positive integer", () => {
    for (const id of [0, -1, 1.5, Number.NaN]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id,
          rev: 5,
          field: "System.State",
          value: "Active",
        }),
      ).toBe(false);
    }
  });
});

describe("isFieldReferenceName", () => {
  it("accepts real ADO reference names", () => {
    expect(isFieldReferenceName("System.State")).toBe(true);
    expect(isFieldReferenceName("Microsoft.VSTS.Scheduling.TargetDate")).toBe(true);
    expect(isFieldReferenceName("Custom.Field1")).toBe(true);
  });

  it("rejects names that would misdirect the JSON Pointer the field is concatenated into", () => {
    // "/fields/" + field is an RFC 6901 pointer, so "/" and "~" would address a different node.
    expect(isFieldReferenceName("System/State")).toBe(false);
    expect(isFieldReferenceName("System.State/../rev")).toBe(false);
    expect(isFieldReferenceName("System~1State")).toBe(false);
    expect(isFieldReferenceName("../../rev")).toBe(false);
  });

  it("rejects names that cannot identify a real ADO field", () => {
    expect(isFieldReferenceName("System")).toBe(false);
    expect(isFieldReferenceName("")).toBe(false);
    expect(isFieldReferenceName(".State")).toBe(false);
    expect(isFieldReferenceName("System.")).toBe(false);
    expect(isFieldReferenceName("1System.State")).toBe(false);
    expect(isFieldReferenceName("System State")).toBe(false);
    expect(isFieldReferenceName(42)).toBe(false);
    expect(isFieldReferenceName(null)).toBe(false);
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

  it("rejects a field that is not a valid ADO reference name", () => {
    for (const field of [42, "System", "System/State", ""]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id: 123,
          rev: 5,
          field,
          value: "Active",
        }),
      ).toBe(false);
    }
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
