import { describe, expect, it } from "vitest";

import {
  describeFieldWriteFailure,
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
});

describe("isUpdateWorkItemFieldMessage - additional fields", () => {
  it("accepts bounded additional field writes for one atomic action", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        field: "System.State",
        value: "Active",
        additionalFields: [{ field: "System.AreaPath", value: "Project\\Apps" }],
      }),
    ).toBe(true);
  });

  it("rejects malformed, duplicate, and unbounded additional field writes", () => {
    const base = {
      type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
      id: 123,
      rev: 5,
      field: "System.State",
      value: "Active",
    };
    expect(isUpdateWorkItemFieldMessage({ ...base, additionalFields: "System.AreaPath" })).toBe(
      false,
    );
    expect(
      isUpdateWorkItemFieldMessage({
        ...base,
        additionalFields: [{ field: "System/AreaPath", value: "Project\\Apps" }],
      }),
    ).toBe(false);
    expect(
      isUpdateWorkItemFieldMessage({
        ...base,
        additionalFields: [{ field: "System.State", value: "Done" }],
      }),
    ).toBe(false);
    expect(
      isUpdateWorkItemFieldMessage({
        ...base,
        additionalFields: Array.from({ length: 9 }, (_, index) => ({
          field: `Custom.Field${index}`,
          value: String(index),
        })),
      }),
    ).toBe(false);
  });
});

describe("isUpdateWorkItemFieldMessage - preconditions", () => {
  it("accepts bounded field preconditions for one atomic action", () => {
    expect(
      isUpdateWorkItemFieldMessage({
        type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
        id: 123,
        rev: 5,
        field: "System.IterationPath",
        value: "Project\\Sprint 2",
        preconditions: [{ field: "System.State", value: "Active" }],
      }),
    ).toBe(true);
  });

  it("rejects malformed, duplicate, and unbounded preconditions", () => {
    const base = {
      type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
      id: 123,
      rev: 5,
      field: "System.IterationPath",
      value: "Project\\Sprint 2",
    };
    expect(isUpdateWorkItemFieldMessage({ ...base, preconditions: "System.State" })).toBe(false);
    expect(
      isUpdateWorkItemFieldMessage({
        ...base,
        preconditions: [{ field: "System/State", value: "Active" }],
      }),
    ).toBe(false);
    expect(
      isUpdateWorkItemFieldMessage({
        ...base,
        preconditions: [
          { field: "System.State", value: "Active" },
          { field: "System.State", value: "Waiting" },
        ],
      }),
    ).toBe(false);
    expect(
      isUpdateWorkItemFieldMessage({
        ...base,
        preconditions: Array.from({ length: 9 }, (_, index) => ({
          field: `Custom.Guard${index}`,
          value: String(index),
        })),
      }),
    ).toBe(false);
  });
});

describe("isUpdateWorkItemFieldMessage - rejected type and id", () => {
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

  it("accepts the two multiline storage formats ADO knows", () => {
    for (const multilineFormat of ["Markdown", "Html", undefined]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id: 123,
          rev: 5,
          field: "System.Description",
          value: "text",
          multilineFormat,
        }),
      ).toBe(true);
    }
  });
});

describe("isUpdateWorkItemFieldMessage - multiline format", () => {
  it("rejects any other multiline format, so no caller string reaches the patch body", () => {
    for (const multilineFormat of ["markdown", "", 1, null, "Html /rev"]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id: 123,
          rev: 5,
          field: "System.Description",
          value: "text",
          multilineFormat,
        }),
      ).toBe(false);
    }
  });
});

describe("isUpdateWorkItemFieldMessage - value", () => {
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

describe("isUpdateWorkItemFieldMessage - comment", () => {
  it("accepts a plain-text comment riding along with the field change, or none at all", () => {
    for (const comment of ["[BLOCKED] Waiting on the API.", "", undefined]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id: 123,
          rev: 5,
          field: "System.Tags",
          value: "Blocked",
          comment,
        }),
      ).toBe(true);
    }
  });

  it("rejects a comment that is not a string, so nothing else reaches the patch body", () => {
    for (const comment of [1, null, {}, ["a"]]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id: 123,
          rev: 5,
          field: "System.Tags",
          value: "Blocked",
          comment,
        }),
      ).toBe(false);
    }
  });
});

describe("isUpdateWorkItemFieldMessage - base value", () => {
  it("accepts the field's expected current value, a cleared one, or none at all", () => {
    for (const baseValue of ["Blocked", "", null, undefined]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id: 123,
          rev: 5,
          field: "System.Tags",
          value: "Blocked; Interrupt",
          baseValue,
        }),
      ).toBe(true);
    }
  });

  it("rejects a base value that is neither a string nor null", () => {
    for (const baseValue of [1, {}, ["a"]]) {
      expect(
        isUpdateWorkItemFieldMessage({
          type: UPDATE_WORK_ITEM_FIELD_MESSAGE,
          id: 123,
          rev: 5,
          field: "System.Tags",
          value: "Blocked; Interrupt",
          baseValue,
        }),
      ).toBe(false);
    }
  });
});

describe("describeFieldWriteFailure", () => {
  it("appends ADO's message when the refusal carried a JSON envelope", () => {
    expect(
      describeFieldWriteFailure({
        ok: false,
        error: "HTTP 400",
        detail: '{"message":"TF401320: Rule Error for field Reason."}',
      }),
    ).toBe("HTTP 400: TF401320: Rule Error for field Reason.");
  });

  it("falls back to the raw body when it is not JSON", () => {
    expect(describeFieldWriteFailure({ ok: false, error: "HTTP 400", detail: " sign in " })).toBe(
      "HTTP 400: sign in",
    );
  });

  it("bounds the body it reports", () => {
    expect(
      describeFieldWriteFailure({ ok: false, error: "HTTP 400", detail: "x".repeat(700) }),
    ).toBe(`HTTP 400: ${"x".repeat(600)}`);
  });

  it("reports the status alone when there is no body, and unknown when there is no status", () => {
    expect(describeFieldWriteFailure({ ok: false, error: "HTTP 412" })).toBe("HTTP 412");
    expect(describeFieldWriteFailure({ ok: false, detail: "   " })).toBe("unknown");
  });
});
