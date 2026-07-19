import { describe, expect, it } from "vitest";

import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("returns an explicit theme unchanged", () => {
    expect(resolveTheme("light", null)).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("blue", "dark")).toBe("blue");
  });

  it("follows the ADO theme when set to auto", () => {
    expect(resolveTheme("auto", "light")).toBe("light");
    expect(resolveTheme("auto", "dark")).toBe("dark");
  });

  it("falls back to dark when auto has no ADO theme to follow", () => {
    expect(resolveTheme("auto", null)).toBe("dark");
  });
});
