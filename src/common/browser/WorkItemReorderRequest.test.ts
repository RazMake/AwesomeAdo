import { describe, expect, it } from "vitest";

import {
  describeReorderFailure,
  isReorderWorkItemMessage,
  reorderMessageProblem,
  REORDER_WORK_ITEM_MESSAGE,
  type ReorderWorkItemMessage,
} from "./WorkItemReorderRequest";

/** A well-formed message, with `overrides` applied so each test states only what it is probing. */
const message = (overrides: Record<string, unknown> = {}): unknown => ({
  type: REORDER_WORK_ITEM_MESSAGE,
  id: 123,
  rev: 5,
  parentId: 10,
  currentParentId: 11,
  previousId: 3,
  nextId: 4,
  team: "Web",
  ...overrides,
});

/** The id fields that accept ADO's `0` sentinel as well as a real work item id. */
const SENTINEL_FIELDS = ["parentId", "currentParentId", "previousId", "nextId"] as const;

describe("isReorderWorkItemMessage - shape", () => {
  it("accepts a well-formed message", () => {
    expect(isReorderWorkItemMessage(message())).toBe(true);
  });

  it("narrows the value to a ReorderWorkItemMessage", () => {
    const value: unknown = message();

    expect(isReorderWorkItemMessage(value)).toBe(true);
    if (isReorderWorkItemMessage(value)) {
      const narrowed: ReorderWorkItemMessage = value;
      expect(narrowed.id).toBe(123);
    }
  });

  it("rejects a wrong type discriminator", () => {
    expect(isReorderWorkItemMessage(message({ type: "awesomeado:something-else" }))).toBe(false);
    expect(isReorderWorkItemMessage(message({ type: undefined }))).toBe(false);
  });

  it("rejects values that are not objects", () => {
    expect(isReorderWorkItemMessage(null)).toBe(false);
    expect(isReorderWorkItemMessage(undefined)).toBe(false);
    expect(isReorderWorkItemMessage("awesomeado:reorder-work-item")).toBe(false);
    expect(isReorderWorkItemMessage(42)).toBe(false);
  });
});

describe("isReorderWorkItemMessage - the moved item's id", () => {
  it("rejects an id that is missing or not a number", () => {
    expect(isReorderWorkItemMessage(message({ id: undefined }))).toBe(false);
    expect(isReorderWorkItemMessage(message({ id: "123" }))).toBe(false);
  });

  it("rejects an id that cannot name a real work item", () => {
    for (const id of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isReorderWorkItemMessage(message({ id }))).toBe(false);
    }
  });

  it("rejects 0, which is a sentinel for the neighbours but never a moved item", () => {
    expect(isReorderWorkItemMessage(message({ id: 0 }))).toBe(false);
  });
});

describe("isReorderWorkItemMessage - parent and neighbour ids", () => {
  it("accepts 0 for every field that takes ADO's no-parent / end-of-list sentinel", () => {
    for (const field of SENTINEL_FIELDS) {
      expect(isReorderWorkItemMessage(message({ [field]: 0 }))).toBe(true);
    }
  });

  it("rejects a negative id in any sentinel field", () => {
    for (const field of SENTINEL_FIELDS) {
      expect(isReorderWorkItemMessage(message({ [field]: -1 }))).toBe(false);
    }
  });

  it("rejects a fractional id in any sentinel field", () => {
    for (const field of SENTINEL_FIELDS) {
      expect(isReorderWorkItemMessage(message({ [field]: 2.5 }))).toBe(false);
    }
  });

  it("rejects a missing or non-numeric id in any sentinel field", () => {
    for (const field of SENTINEL_FIELDS) {
      expect(isReorderWorkItemMessage(message({ [field]: undefined }))).toBe(false);
      expect(isReorderWorkItemMessage(message({ [field]: "10" }))).toBe(false);
    }
  });
});

describe("isReorderWorkItemMessage - rev and team", () => {
  it("rejects a rev that is missing, non-numeric or fractional", () => {
    expect(isReorderWorkItemMessage(message({ rev: undefined }))).toBe(false);
    expect(isReorderWorkItemMessage(message({ rev: "5" }))).toBe(false);
    expect(isReorderWorkItemMessage(message({ rev: 5.5 }))).toBe(false);
    expect(isReorderWorkItemMessage(message({ rev: Number.NaN }))).toBe(false);
  });

  it("accepts a rev of 0, which a freshly created item can legitimately carry", () => {
    expect(isReorderWorkItemMessage(message({ rev: 0 }))).toBe(true);
  });

  it("rejects a blank or whitespace-only team, which cannot scope a backlog order", () => {
    expect(isReorderWorkItemMessage(message({ team: "" }))).toBe(false);
    expect(isReorderWorkItemMessage(message({ team: "   " }))).toBe(false);
  });

  it("rejects a missing or non-string team", () => {
    expect(isReorderWorkItemMessage(message({ team: undefined }))).toBe(false);
    expect(isReorderWorkItemMessage(message({ team: 7 }))).toBe(false);
  });
});

describe("isReorderWorkItemMessage - agreement with reorderMessageProblem", () => {
  it("accepts exactly the messages reorderMessageProblem finds nothing wrong with", () => {
    // The guard is now built on the reason, so the two must never be able to disagree.
    const candidates: unknown[] = [
      message(),
      message({ rev: 0 }),
      message({ parentId: 0, previousId: 0, nextId: 0 }),
      message({ type: "awesomeado:something-else" }),
      message({ id: 0 }),
      message({ nextId: -1 }),
      message({ rev: -1 }),
      message({ team: "  " }),
      null,
      42,
    ];

    for (const candidate of candidates) {
      expect(isReorderWorkItemMessage(candidate)).toBe(reorderMessageProblem(candidate) === null);
    }
  });
});

describe("reorderMessageProblem - the message envelope", () => {
  it("finds no problem with a well-formed message", () => {
    expect(reorderMessageProblem(message())).toBeNull();
  });

  it("says so when the value is not an object at all", () => {
    for (const value of [null, undefined, "awesomeado:reorder-work-item", 42]) {
      expect(reorderMessageProblem(value)).toBe("message is not an object");
    }
  });

  it("names both the type it was given and the one it expected", () => {
    expect(reorderMessageProblem(message({ type: "awesomeado:something-else" }))).toBe(
      `type is "awesomeado:something-else", expected "${REORDER_WORK_ITEM_MESSAGE}"`,
    );
    expect(reorderMessageProblem(message({ type: undefined }))).toBe(
      `type is "undefined", expected "${REORDER_WORK_ITEM_MESSAGE}"`,
    );
  });
});

describe("reorderMessageProblem - the work item references", () => {
  it("names the id, and the value it was given, when it cannot address a work item", () => {
    expect(reorderMessageProblem(message({ id: undefined }))).toBe(
      "id undefined is not a positive integer work item id",
    );
    expect(reorderMessageProblem(message({ id: "123" }))).toBe(
      'id "123" is not a positive integer work item id',
    );
    for (const id of [0, -1, 1.5, Number.NaN]) {
      expect(reorderMessageProblem(message({ id }))).toBe(
        `id ${String(id)} is not a positive integer work item id`,
      );
    }
  });

  it("names the offending sentinel field rather than a sibling one", () => {
    for (const field of SENTINEL_FIELDS) {
      const problem = reorderMessageProblem(message({ [field]: -1 }));

      // Naming the field is the whole point: an ignored message otherwise reaches the content side
      // as the uninformative "no response from background".
      expect(problem).toBe(`${field} -1 is not a work item id or 0`);
      for (const sibling of SENTINEL_FIELDS.filter((name) => name !== field)) {
        expect(problem).not.toContain(sibling);
      }
    }
  });

  it("names a sentinel field that is fractional, missing or not a number", () => {
    for (const field of SENTINEL_FIELDS) {
      expect(reorderMessageProblem(message({ [field]: 2.5 }))).toBe(
        `${field} 2.5 is not a work item id or 0`,
      );
      expect(reorderMessageProblem(message({ [field]: undefined }))).toBe(
        `${field} undefined is not a work item id or 0`,
      );
      expect(reorderMessageProblem(message({ [field]: "10" }))).toBe(
        `${field} "10" is not a work item id or 0`,
      );
    }
  });
});

describe("reorderMessageProblem - the rev and the team", () => {
  it("names the rev when it is not a non-negative integer", () => {
    expect(reorderMessageProblem(message({ rev: undefined }))).toBe(
      "rev undefined is not a non-negative integer",
    );
    expect(reorderMessageProblem(message({ rev: "5" }))).toBe(
      'rev "5" is not a non-negative integer',
    );
    expect(reorderMessageProblem(message({ rev: 5.5 }))).toBe(
      "rev 5.5 is not a non-negative integer",
    );
    expect(reorderMessageProblem(message({ rev: -1 }))).toBe(
      "rev -1 is not a non-negative integer",
    );
  });

  it("points a missing or blank team at the option that configures it", () => {
    for (const team of [undefined, 7, "", "   "]) {
      expect(reorderMessageProblem(message({ team }))).toBe(
        "team is missing or blank (no team is configured in AwesomeADO options)",
      );
    }
  });
});

describe("describeReorderFailure", () => {
  it("prefers the message field of a JSON body, which is ADO's actual explanation", () => {
    const detail = JSON.stringify({ message: "TF401232: work item 123 does not exist" });

    expect(describeReorderFailure({ ok: false, error: "order HTTP 404", detail })).toBe(
      "order HTTP 404: TF401232: work item 123 does not exist",
    );
  });

  it("surfaces a non-JSON body verbatim, since that is the clue when there is no message", () => {
    // An expired session answers with a sign-in page rather than an API error.
    expect(
      describeReorderFailure({
        ok: false,
        error: "order HTTP 203",
        detail: "<html>Sign in to Azure DevOps</html>",
      }),
    ).toBe("order HTTP 203: <html>Sign in to Azure DevOps</html>");
  });

  it("falls back to the raw body when the JSON carries no usable message", () => {
    expect(
      describeReorderFailure({ ok: false, error: "order HTTP 400", detail: '{"message":""}' }),
    ).toBe('order HTTP 400: {"message":""}');
    expect(
      describeReorderFailure({ ok: false, error: "order HTTP 400", detail: '{"message":7}' }),
    ).toBe('order HTTP 400: {"message":7}');
  });

  it("trims the body before folding it into the sentence", () => {
    expect(
      describeReorderFailure({ ok: false, error: "order HTTP 400", detail: "  bad request  " }),
    ).toBe("order HTTP 400: bad request");
  });

  it("reports that there was no response body when the detail is absent or blank", () => {
    expect(describeReorderFailure({ ok: false, error: "order HTTP 500" })).toBe(
      "order HTTP 500 (no response body)",
    );
    expect(describeReorderFailure({ ok: false, error: "order HTTP 500", detail: "   " })).toBe(
      "order HTTP 500 (no response body)",
    );
  });

  it("falls back to a generic prefix when the response names no status", () => {
    expect(describeReorderFailure({ ok: false })).toBe("reorder failed (no response body)");
    expect(describeReorderFailure({ ok: false, detail: "boom" })).toBe("reorder failed: boom");
  });
});
