import { describe, expect, it } from "vitest";

import {
  formatWorkItemTags,
  hasWorkItemTag,
  parseWorkItemTags,
  withWorkItemTag,
  withoutWorkItemTag,
} from "./workItemTags";

describe("parseWorkItemTags", () => {
  it("splits ADO's semicolon-separated field and trims the padding", () => {
    expect(parseWorkItemTags("Blocked; Blocked by another team")).toEqual([
      "Blocked",
      "Blocked by another team",
    ]);
  });

  it("drops empty entries left by stray separators", () => {
    expect(parseWorkItemTags(";Blocked;;")).toEqual(["Blocked"]);
  });

  it("answers an empty list for an item ADO returned no tags field for", () => {
    expect(parseWorkItemTags(undefined)).toEqual([]);
    expect(parseWorkItemTags(null)).toEqual([]);
    expect(parseWorkItemTags(42)).toEqual([]);
  });
});

describe("formatWorkItemTags", () => {
  it("joins tags the way ADO stores them", () => {
    expect(formatWorkItemTags(["Blocked", "Interrupt"])).toBe("Blocked; Interrupt");
  });

  it("answers an empty string for no tags, which clears the field", () => {
    expect(formatWorkItemTags([])).toBe("");
  });
});

describe("hasWorkItemTag", () => {
  it("matches regardless of casing and padding, like ADO itself", () => {
    expect(hasWorkItemTag(["  Blocked "], "blocked")).toBe(true);
  });

  it("does not match a different tag", () => {
    expect(hasWorkItemTag(["Blocked"], "Blocked by another team")).toBe(false);
  });

  it("never matches a blank tag, so an unconfigured marker reads as absent", () => {
    expect(hasWorkItemTag(["Blocked"], "   ")).toBe(false);
  });
});

describe("withWorkItemTag", () => {
  it("appends the tag, keeping the order the existing tags were stored in", () => {
    expect(withWorkItemTag(["Interrupt"], "Blocked")).toEqual(["Interrupt", "Blocked"]);
  });

  it("leaves an item that already wears the tag untouched, whatever its casing", () => {
    expect(withWorkItemTag(["blocked"], "Blocked")).toEqual(["blocked"]);
  });

  it("ignores a blank tag rather than storing an empty entry", () => {
    expect(withWorkItemTag(["Interrupt"], "  ")).toEqual(["Interrupt"]);
  });
});

describe("withoutWorkItemTag", () => {
  it("removes the tag case-insensitively and keeps the rest", () => {
    expect(withoutWorkItemTag(["Interrupt", "blocked"], "Blocked")).toEqual(["Interrupt"]);
  });

  it("leaves a list that never carried the tag alone", () => {
    expect(withoutWorkItemTag(["Interrupt"], "Blocked")).toEqual(["Interrupt"]);
  });
});
