import { describe, expect, it } from "vitest";

import type { Theme } from "../../settings/ExtensionSettings";

import {
  VIEW_THEME_VARIABLES,
  resolveViewThemeColorScheme,
  resolveViewThemePalette,
} from "./viewTheme";

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

describe("resolveViewThemeColorScheme", () => {
  it("returns null for 'auto' so the caller can ask ADO which scheme it paints", () => {
    expect(resolveViewThemeColorScheme("auto")).toBeNull();
  });

  it("maps each concrete theme to the scheme its palette paints", () => {
    expect(resolveViewThemeColorScheme("dark")).toBe("dark");
    expect(resolveViewThemeColorScheme("light")).toBe("light");
    // Blue is a light-surface palette, so browser-drawn widgets must stay light there too.
    expect(resolveViewThemeColorScheme("blue")).toBe("light");
  });
});
