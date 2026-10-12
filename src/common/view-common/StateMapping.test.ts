import { describe, expect, it } from "vitest";

import { describeStateMapping, parseStateMapping, serializeStateMapping } from "./StateMapping";

const COLUMNS = [
  { value: "new", label: "New" },
  { value: "done", label: "Done" },
];

describe("parseStateMapping", () => {
  it("reads nothing from an empty, malformed, or non-array value", () => {
    expect(parseStateMapping("")).toEqual([]);
    expect(parseStateMapping("  ")).toEqual([]);
    expect(parseStateMapping("{not json")).toEqual([]);
    expect(parseStateMapping('{"type":"Bug"}')).toEqual([]);
  });

  it("keeps one row per type and one column per state, trimming names", () => {
    const raw = JSON.stringify([
      { type: " Bug ", states: { new: [" New ", "", 3, "new"], done: ["NEW", "Closed"], x: "no" } },
      { type: "bug", states: { new: ["Ignored"] } },
      { type: "", states: {} },
      { type: "Task", states: [] },
      { type: "Epic" },
      null,
      "Feature",
      { type: "Feature", states: { done: [] } },
    ]);

    expect(parseStateMapping(raw)).toEqual([
      { type: "Bug", states: { new: ["New"], done: ["Closed"] } },
      { type: "Feature", states: {} },
    ]);
  });
});

describe("serializeStateMapping", () => {
  it("drops empty cells and type-less rows, and stores nothing for no rows", () => {
    expect(serializeStateMapping([])).toBe("");
    expect(serializeStateMapping([{ type: " ", states: { new: ["New"] } }])).toBe("");
    expect(serializeStateMapping([{ type: "Bug", states: { new: [] } }])).toBe("");
    expect(
      serializeStateMapping([{ type: "Bug", states: { new: ["New", "Proposed"], done: [] } }]),
    ).toBe('[{"type":"Bug","states":{"new":["New","Proposed"]}}]');
  });

  it("round-trips through parse", () => {
    const rows = [{ type: "Bug", states: { done: ["Closed", "Resolved"] } }];

    expect(parseStateMapping(serializeStateMapping(rows))).toEqual(rows);
  });
});

describe("describeStateMapping", () => {
  it("summarizes each row in column order", () => {
    const raw = JSON.stringify([
      { type: "Bug", states: { done: ["Closed", "Resolved"], new: ["New"] } },
      { type: "Task", states: {} },
    ]);

    expect(describeStateMapping("", COLUMNS)).toBe("None");
    expect(describeStateMapping(raw, COLUMNS)).toBe(
      "Bug: New = New; Done = Closed, Resolved · Task: nothing mapped",
    );
  });
});
