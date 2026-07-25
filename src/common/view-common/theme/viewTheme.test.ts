import { describe, expect, it } from "vitest";

import type { Theme } from "../../settings/ExtensionSettings";

import { VIEW_THEME_VARIABLES, resolveViewThemePalette } from "./viewTheme";

describe("resolveViewThemePalette", () => {
  it("returns null for 'auto' so controls follow ADO's own theme", () => {
    expect(resolveViewThemePalette("auto")).toBeNull();
  });

  it.each(["light", "dark", "blue"] as const)(
    "returns a full palette for the concrete %s theme",
    (theme) => {
      const palette = resolveViewThemePalette(theme);
      expect(palette).not.toBeNull();
      // Every pinned token must have a value, otherwise a control would fall back to a stale/other
      // theme's inherited token and the view would look half-themed.
      for (const name of VIEW_THEME_VARIABLES) {
        expect(palette?.[name]).toBeTruthy();
      }
    },
  );

  it("gives each concrete theme a distinct primary text color", () => {
    const primary = (theme: Theme): string | undefined =>
      resolveViewThemePalette(theme)?.["--text-primary-color"];
    const colors = new Set([primary("light"), primary("dark"), primary("blue")]);
    expect(colors.size).toBe(3);
  });
});
