import { describe, expect, it } from "vitest";

import { THEME_COLOR_VARIABLES } from "./ThemeDefinition";
import { CONCRETE_THEMES, THEME_IDS, THEME_PREFERENCES, getTheme, resolveTheme } from "./themes";

describe("theme registry", () => {
  it("registers Dark, Light, and Blue as independent concrete themes", () => {
    expect(CONCRETE_THEMES.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "dark", label: "Dark" },
      { id: "light", label: "Light" },
      { id: "blue", label: "Blue" },
    ]);
    expect(THEME_IDS).toEqual(["dark", "light", "blue"]);
    expect(THEME_PREFERENCES).toEqual(["auto", "dark", "light", "blue"]);
  });

  it.each(THEME_IDS)("gives the %s theme every required color", (themeId) => {
    const theme = getTheme(themeId);
    expect(Object.keys(theme.colors)).toHaveLength(THEME_COLOR_VARIABLES.length);
    for (const variable of THEME_COLOR_VARIABLES) {
      expect(theme.colors[variable]).toBeTruthy();
    }
  });

  it("keeps ordinary item hover highlights discrete in every palette", () => {
    expect(
      CONCRETE_THEMES.map(({ id, colors }) => [id, colors["--item-row-hover-background"]]),
    ).toEqual([
      ["dark", "#292929"],
      ["light", "#f0f3f6"],
      ["blue", "#deebf7"],
    ]);
  });
});

describe("resolveTheme", () => {
  it("keeps manually selected themes unchanged", () => {
    expect(resolveTheme("blue", "dark").id).toBe("blue");
    expect(resolveTheme("light", "dark").id).toBe("light");
  });

  it("limits Follow ADO to Dark and Light", () => {
    expect(resolveTheme("auto", "dark").id).toBe("dark");
    expect(resolveTheme("auto", "light").id).toBe("light");
    expect(resolveTheme("auto", null).id).toBe("dark");
  });
});
