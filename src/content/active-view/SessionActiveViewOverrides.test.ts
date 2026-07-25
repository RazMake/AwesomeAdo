import { describe, expect, it } from "vitest";

import { SessionActiveViewOverrides } from "./SessionActiveViewOverrides";

describe("SessionActiveViewOverrides", () => {
  it("has no override for a query the user has not switched this session", () => {
    // The ground state on every page load: a query follows the configured default until switched.
    expect(new SessionActiveViewOverrides().get("q")).toBeUndefined();
  });

  it("remembers the most recent choice made for a query", () => {
    const overrides = new SessionActiveViewOverrides();

    overrides.set("q", "standard");
    expect(overrides.get("q")).toBe("standard");

    overrides.set("q", "enhanced");
    expect(overrides.get("q")).toBe("enhanced");
  });

  it("keeps each query's choice independent", () => {
    const overrides = new SessionActiveViewOverrides();

    overrides.set("a", "standard");
    overrides.set("b", "enhanced");

    expect(overrides.get("a")).toBe("standard");
    expect(overrides.get("b")).toBe("enhanced");
    expect(overrides.get("c")).toBeUndefined();
  });
});
