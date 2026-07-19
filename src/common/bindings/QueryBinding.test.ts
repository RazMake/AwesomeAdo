import { describe, expect, it } from "vitest";

import { normalizeBindings, resolveActiveView } from "./QueryBinding";

describe("normalizeBindings", () => {
  it("returns an empty map for undefined (first run)", () => {
    expect(normalizeBindings(undefined)).toEqual({});
  });

  it("returns an empty map for a non-object value", () => {
    expect(normalizeBindings("nope")).toEqual({});
    expect(normalizeBindings(42)).toEqual({});
    expect(normalizeBindings(null)).toEqual({});
  });

  it("keeps a well-formed binding without inventing an active override", () => {
    const raw = { "query-1": { view: "sprint", properties: { iteration: "Sprint 42" } } };
    expect(normalizeBindings(raw)).toEqual({
      "query-1": { view: "sprint", properties: { iteration: "Sprint 42" } },
    });
  });

  it("defaults missing properties to an empty object", () => {
    expect(normalizeBindings({ "query-1": { view: "sprint" } })).toEqual({
      "query-1": { view: "sprint", properties: {} },
    });
  });

  it("keeps a stored query name and drops an empty or non-string one", () => {
    expect(normalizeBindings({ a: { view: "sprint", properties: {}, name: "My Bugs" } })).toEqual({
      a: { view: "sprint", properties: {}, name: "My Bugs" },
    });
    expect(normalizeBindings({ a: { view: "sprint", properties: {}, name: "" } })).toEqual({
      a: { view: "sprint", properties: {} },
    });
    expect(normalizeBindings({ a: { view: "sprint", properties: {}, name: 5 } })).toEqual({
      a: { view: "sprint", properties: {} },
    });
  });

  it("preserves an unknown view id so a newer build's binding still counts as handled", () => {
    const raw = { "query-1": { view: "future-view", properties: {} } };
    expect(normalizeBindings(raw)).toEqual({
      "query-1": { view: "future-view", properties: {} },
    });
  });

  it("keeps an explicit standard or enhanced active override", () => {
    expect(
      normalizeBindings({ a: { view: "sprint", properties: {}, active: "standard" } }),
    ).toEqual({ a: { view: "sprint", properties: {}, active: "standard" } });
    expect(
      normalizeBindings({ a: { view: "sprint", properties: {}, active: "enhanced" } }),
    ).toEqual({ a: { view: "sprint", properties: {}, active: "enhanced" } });
  });

  it("drops an unrecognized active value so the query follows the global default", () => {
    const raw = { "query-1": { view: "sprint", properties: {}, active: "sideways" } };
    expect(normalizeBindings(raw)).toEqual({
      "query-1": { view: "sprint", properties: {} },
    });
  });

  it("drops entries without a usable view id", () => {
    const raw = {
      good: { view: "sprint", properties: {} },
      missingView: { properties: {} },
      emptyView: { view: "", properties: {} },
      notAnObject: 7,
    };
    expect(normalizeBindings(raw)).toEqual({
      good: { view: "sprint", properties: {} },
    });
  });

  it("drops non-string property values rather than coercing them", () => {
    const raw = { "query-1": { view: "sprint", properties: { keep: "yes", drop: 5, gone: null } } };
    expect(normalizeBindings(raw)).toEqual({
      "query-1": { view: "sprint", properties: { keep: "yes" } },
    });
  });

  it("ignores a non-object properties value", () => {
    expect(normalizeBindings({ "query-1": { view: "sprint", properties: "oops" } })).toEqual({
      "query-1": { view: "sprint", properties: {} },
    });
  });
});

describe("resolveActiveView", () => {
  it("honors an explicit per-query override regardless of the default", () => {
    expect(resolveActiveView("standard", true)).toBe("standard");
    expect(resolveActiveView("enhanced", false)).toBe("enhanced");
  });

  it("follows the global default when the query has no override", () => {
    expect(resolveActiveView(undefined, true)).toBe("enhanced");
    expect(resolveActiveView(undefined, false)).toBe("standard");
  });
});
