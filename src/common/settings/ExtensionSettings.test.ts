import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizeSettings } from "./ExtensionSettings";

describe("normalizeSettings", () => {
  it.each([undefined, null, false, 42, "settings"])(
    "returns defaults for non-object input %#",
    (raw) => {
      expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    },
  );

  it("uses defaults when fields are missing", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("uses defaults when fields have the wrong type", () => {
    expect(normalizeSettings({ theme: 1, defaultView: true })).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to the default for an unknown theme value", () => {
    expect(normalizeSettings({ theme: "rainbow" }).theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("falls back to the default for an unknown defaultView value", () => {
    expect(normalizeSettings({ defaultView: "sprint" }).defaultView).toBe(
      DEFAULT_SETTINGS.defaultView,
    );
  });

  it.each(["auto", "light", "dark", "blue"] as const)("preserves a valid theme %s", (theme) => {
    expect(normalizeSettings({ theme }).theme).toBe(theme);
  });

  it.each(["original", "enhanced"] as const)("preserves a valid defaultView %s", (defaultView) => {
    expect(normalizeSettings({ defaultView }).defaultView).toBe(defaultView);
  });

  it("normalizes each field independently", () => {
    expect(normalizeSettings({ theme: "dark", defaultView: "nope" })).toEqual({
      theme: "dark",
      defaultView: DEFAULT_SETTINGS.defaultView,
    });
  });
});
