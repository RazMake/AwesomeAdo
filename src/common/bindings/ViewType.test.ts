import { describe, expect, it } from "vitest";

import {
  getViewType,
  resolveViewTypePropertyValue,
  VIEW_TYPES,
  viewTypePropertyKind,
  type ViewTypeProperty,
} from "./ViewType";

describe("VIEW_TYPES", () => {
  it("offers Sprint View and Project Tracking, in order", () => {
    expect(VIEW_TYPES.map((view) => view.label)).toEqual(["Sprint View", "Project Tracking"]);
  });

  it("uses stable ids for every view", () => {
    expect(VIEW_TYPES.map((view) => view.id)).toEqual(["sprint", "projectTracking"]);
  });

  it("keeps every property optional so any view can still be bound as-is", () => {
    for (const view of VIEW_TYPES) {
      expect(view.properties.every((property) => !property.required)).toBe(true);
    }
  });

  it("gives Project Tracking its ordering, updates, completed, and recent-change fields", () => {
    const tracking = getViewType("projectTracking");
    expect(tracking?.properties.map((property) => property.key)).toEqual([
      "orderingPolicy",
      "weeks",
      "days",
      "hours",
    ]);
    const byKey = new Map(tracking?.properties.map((property) => [property.key, property]));
    expect(byKey.get("orderingPolicy")).toMatchObject({
      kind: "select",
      defaultValue: "importance",
    });
    expect(byKey.get("orderingPolicy")?.options).toEqual([
      { value: "importance", label: "By Importance (most important first)" },
      { value: "title", label: "By Title (a-z)" },
      { value: "eta", label: "By ETA (past/recent - future)" },
    ]);
    expect(byKey.get("weeks")).toMatchObject({
      kind: "number",
      defaultValue: "2",
      min: 1,
      max: 52,
    });
    expect(byKey.get("days")).toMatchObject({
      kind: "number",
      defaultValue: "4",
      min: 0,
      max: 3650,
    });
    expect(byKey.get("hours")).toMatchObject({ kind: "number", defaultValue: "24", min: 1 });
  });
});

describe("getViewType", () => {
  it("returns the matching view by id", () => {
    expect(getViewType("sprint")?.label).toBe("Sprint View");
  });

  it("returns undefined for an unknown id", () => {
    expect(getViewType("does-not-exist")).toBeUndefined();
  });
});

describe("viewTypePropertyKind", () => {
  it("treats an unspecified kind as plain text", () => {
    expect(viewTypePropertyKind({ key: "k", label: "K", required: false })).toBe("text");
  });

  it("returns the declared kind when present", () => {
    expect(viewTypePropertyKind({ key: "k", label: "K", required: false, kind: "number" })).toBe(
      "number",
    );
    expect(viewTypePropertyKind({ key: "k", label: "K", required: false, kind: "select" })).toBe(
      "select",
    );
  });
});

describe("resolveViewTypePropertyValue", () => {
  const text: ViewTypeProperty = {
    key: "orderField",
    label: "Ordering field",
    required: false,
    defaultValue: "Microsoft.VSTS.Common.StackRank",
  };
  const bounded: ViewTypeProperty = {
    key: "days",
    label: "Days",
    required: false,
    kind: "number",
    defaultValue: "14",
    min: 0,
    max: 3650,
  };

  it("falls back to the default when nothing is stored", () => {
    expect(resolveViewTypePropertyValue(text, undefined)).toBe("Microsoft.VSTS.Common.StackRank");
    expect(resolveViewTypePropertyValue(text, "   ")).toBe("Microsoft.VSTS.Common.StackRank");
  });

  it("keeps a stored value, trimmed", () => {
    expect(resolveViewTypePropertyValue(text, "  Custom.Field  ")).toBe("Custom.Field");
  });

  it("leaves a value empty when there is no stored value and no default", () => {
    expect(
      resolveViewTypePropertyValue({ key: "note", label: "Note", required: false }, undefined),
    ).toBe("");
  });

  it("clamps a number into its inclusive range and truncates fractions", () => {
    expect(resolveViewTypePropertyValue(bounded, "9999")).toBe("3650");
    expect(resolveViewTypePropertyValue(bounded, "-5")).toBe("0");
    expect(resolveViewTypePropertyValue(bounded, "30.9")).toBe("30");
  });

  it("substitutes the default for a non-numeric number value", () => {
    expect(resolveViewTypePropertyValue(bounded, "abc")).toBe("14");
    expect(resolveViewTypePropertyValue(bounded, undefined)).toBe("14");
  });

  it("leaves an open range end unbounded", () => {
    const hours: ViewTypeProperty = {
      key: "hours",
      label: "Hours",
      required: false,
      kind: "number",
      defaultValue: "24",
      min: 1,
    };
    expect(resolveViewTypePropertyValue(hours, "100000")).toBe("100000");
    expect(resolveViewTypePropertyValue(hours, "0")).toBe("1");
  });

  const select: ViewTypeProperty = {
    key: "orderingPolicy",
    label: "Items ordering policy",
    required: false,
    kind: "select",
    options: [
      { value: "importance", label: "By Importance (most important first)" },
      { value: "title", label: "By Title (a-z)" },
    ],
    defaultValue: "importance",
  };

  it("keeps a stored select value only when it is still an offered option", () => {
    expect(resolveViewTypePropertyValue(select, "title")).toBe("title");
  });

  it("falls back to the default when the stored select value is no longer offered", () => {
    expect(resolveViewTypePropertyValue(select, "eta")).toBe("importance");
    expect(resolveViewTypePropertyValue(select, undefined)).toBe("importance");
  });
});
