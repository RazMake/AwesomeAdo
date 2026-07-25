import { describe, expect, it } from "vitest";

import {
  resolveViewTypePropertyValue,
  viewTypePropertyKind,
  type ViewTypeProperty,
} from "./ViewType";

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
