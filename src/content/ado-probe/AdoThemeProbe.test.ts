import { afterEach, describe, expect, it } from "vitest";

import { detectAdoTheme, parseLuminance } from "./AdoThemeProbe";

describe("parseLuminance", () => {
  it("returns 0 for black and ~1 for white", () => {
    expect(parseLuminance("rgb(0, 0, 0)")).toBe(0);
    expect(parseLuminance("rgb(255, 255, 255)")).toBeCloseTo(1);
  });

  it("parses rgba with an alpha channel", () => {
    expect(parseLuminance("rgba(255, 255, 255, 0.5)")).toBeCloseTo(1);
  });

  it.each([undefined, null, "", "transparent", "rgb(1, 2)", "rgba(0, 0, 0, 0)"])(
    "returns null for unusable color %#",
    (color) => {
      expect(parseLuminance(color)).toBeNull();
    },
  );
});

describe("detectAdoTheme", () => {
  afterEach(() => {
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("classifies a dark --background-color token as dark", () => {
    document.body.style.setProperty("--background-color", "rgb(32, 32, 32)");
    expect(detectAdoTheme(document)).toBe("dark");
  });

  it("classifies a light --background-color token as light", () => {
    document.body.style.setProperty("--background-color", "rgb(255, 255, 255)");
    expect(detectAdoTheme(document)).toBe("light");
  });

  it("falls back to the --palette-neutral-0 triple when --background-color is unset", () => {
    document.body.style.setProperty("--palette-neutral-0", "20, 20, 20");
    expect(detectAdoTheme(document)).toBe("dark");
  });

  it("reads the token from the root element when the body has none", () => {
    document.documentElement.style.setProperty("--background-color", "rgba(20, 20, 20, 1)");
    expect(detectAdoTheme(document)).toBe("dark");
  });

  it("returns null when ADO has not applied a theme token, even if the page paints white", () => {
    // A still-loading/un-themed ADO page keeps the white `var(--background-color, white)` fallback;
    // that must not be reported as the Light theme (which flashed the options page white for Dark
    // users). Absent a token, the theme is unknown.
    document.body.style.backgroundColor = "rgb(255, 255, 255)";
    expect(detectAdoTheme(document)).toBeNull();
  });
});
