import { afterEach, describe, expect, it } from "vitest";

import { THEME_COLOR_VARIABLES } from "../../common/view-common/themes/ThemeDefinition";
import { BLUE_THEME } from "../../common/view-common/themes/blueTheme";
import { DARK_THEME } from "../../common/view-common/themes/darkTheme";
import { LIGHT_THEME } from "../../common/view-common/themes/lightTheme";

import { applyContentTheme } from "./applyContentTheme";

type ConcreteTheme = typeof DARK_THEME | typeof LIGHT_THEME | typeof BLUE_THEME;

function expectPalette(element: HTMLElement, theme: ConcreteTheme): void {
  const colors: Record<string, string> = theme.colors;
  for (const variable of THEME_COLOR_VARIABLES) {
    expect(element.style.getPropertyValue(variable), variable).toBe(colors[variable]);
  }
  expect(element.style.getPropertyValue("color-scheme")).toBe(theme.colorScheme);
}

afterEach(() => {
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

describe("applyContentTheme with an explicit theme", () => {
  it.each([
    ["dark", DARK_THEME],
    ["light", LIGHT_THEME],
    ["blue", BLUE_THEME],
  ] as const)("pins the %s palette and color-scheme", (theme, definition) => {
    const element = document.createElement("div");

    applyContentTheme(element, theme, document);

    expectPalette(element, definition);
  });

  it("ignores the theme ADO is painting", () => {
    document.body.style.setProperty("--background-color", "rgb(32, 32, 32)");
    const element = document.createElement("div");

    applyContentTheme(element, "light", document);

    expectPalette(element, LIGHT_THEME);
  });

  it("replaces a previously applied palette", () => {
    const element = document.createElement("div");
    applyContentTheme(element, "dark", document);

    applyContentTheme(element, "light", document);

    expectPalette(element, LIGHT_THEME);
  });
});

describe("applyContentTheme following Azure DevOps", () => {
  it("uses the dark palette when ADO paints dark", () => {
    document.body.style.setProperty("--background-color", "rgb(32, 32, 32)");
    const element = document.createElement("div");

    applyContentTheme(element, "auto", document);

    expectPalette(element, DARK_THEME);
  });

  it("uses the light palette when ADO paints light", () => {
    document.body.style.setProperty("--background-color", "rgb(255, 255, 255)");
    const element = document.createElement("div");

    applyContentTheme(element, "auto", document);

    expectPalette(element, LIGHT_THEME);
  });

  it("falls back to the dark palette when ADO's theme is not detectable", () => {
    const element = document.createElement("div");

    applyContentTheme(element, "auto", document);

    expectPalette(element, DARK_THEME);
  });
});
