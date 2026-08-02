import { describe, expect, it } from "vitest";

import { isoEpoch } from "./isoEpoch";

describe("isoEpoch", () => {
  it("returns epoch milliseconds for a parseable ISO timestamp", () => {
    expect(isoEpoch("2026-07-24T15:30:00.000Z")).toBe(Date.parse("2026-07-24T15:30:00.000Z"));
  });

  it("treats every kind of missing timestamp as no answer", () => {
    expect(isoEpoch(null)).toBeNull();
    expect(isoEpoch(undefined)).toBeNull();
    expect(isoEpoch("")).toBeNull();
  });

  it("treats an unparseable timestamp as no answer rather than NaN", () => {
    expect(isoEpoch("not a date")).toBeNull();
  });
});
