import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  MAX_FUTURE_SPRINTS,
  MIN_FUTURE_SPRINTS,
  defaultAreaPathLabel,
  normalizeAreaPaths,
  normalizeFutureSprintsCount,
  normalizeSettings,
} from "./ExtensionSettings";

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
      ...DEFAULT_SETTINGS,
      theme: "dark",
      defaultView: DEFAULT_SETTINGS.defaultView,
    });
  });

  it("keeps a valid currentTeam and drops an invalid one", () => {
    expect(normalizeSettings({ currentTeam: { id: "t1", name: "Platform" } }).currentTeam).toEqual({
      id: "t1",
      name: "Platform",
    });
    expect(normalizeSettings({ currentTeam: { id: "t1" } }).currentTeam).toBeNull();
    expect(normalizeSettings({ currentTeam: "team" }).currentTeam).toBeNull();
  });

  it("clamps and defaults futureSprintsCount through normalizeSettings", () => {
    expect(normalizeSettings({ futureSprintsCount: 4 }).futureSprintsCount).toBe(4);
    expect(normalizeSettings({ futureSprintsCount: 99 }).futureSprintsCount).toBe(
      MAX_FUTURE_SPRINTS,
    );
    expect(normalizeSettings({ futureSprintsCount: "x" }).futureSprintsCount).toBe(
      DEFAULT_SETTINGS.futureSprintsCount,
    );
  });

  it("normalizes areaPaths through normalizeSettings", () => {
    expect(normalizeSettings({ areaPaths: [{ path: "A\\B", label: "B" }] }).areaPaths).toEqual([
      { path: "A\\B", label: "B" },
    ]);
    expect(normalizeSettings({ areaPaths: "nope" }).areaPaths).toEqual([]);
  });
});

describe("normalizeFutureSprintsCount", () => {
  it("defaults non-numbers and non-finite values", () => {
    expect(normalizeFutureSprintsCount(undefined)).toBe(DEFAULT_SETTINGS.futureSprintsCount);
    expect(normalizeFutureSprintsCount("3")).toBe(DEFAULT_SETTINGS.futureSprintsCount);
    expect(normalizeFutureSprintsCount(Number.NaN)).toBe(DEFAULT_SETTINGS.futureSprintsCount);
    expect(normalizeFutureSprintsCount(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_SETTINGS.futureSprintsCount,
    );
  });

  it("clamps to the inclusive bounds and truncates fractions", () => {
    expect(normalizeFutureSprintsCount(0)).toBe(MIN_FUTURE_SPRINTS);
    expect(normalizeFutureSprintsCount(-5)).toBe(MIN_FUTURE_SPRINTS);
    expect(normalizeFutureSprintsCount(100)).toBe(MAX_FUTURE_SPRINTS);
    expect(normalizeFutureSprintsCount(4.9)).toBe(4);
  });
});

describe("defaultAreaPathLabel", () => {
  it("returns the last non-empty backslash-separated segment", () => {
    expect(defaultAreaPathLabel("Project\\Area\\Team")).toBe("Team");
    expect(defaultAreaPathLabel("Solo")).toBe("Solo");
  });

  it("ignores trailing separators and blank segments", () => {
    expect(defaultAreaPathLabel("Project\\Area\\")).toBe("Area");
    expect(defaultAreaPathLabel("A\\ \\C")).toBe("C");
  });

  it("returns an empty string when there is no usable segment", () => {
    expect(defaultAreaPathLabel("")).toBe("");
    expect(defaultAreaPathLabel("\\\\")).toBe("");
  });
});

describe("normalizeAreaPaths", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeAreaPaths(undefined)).toEqual([]);
    expect(normalizeAreaPaths({ path: "A" })).toEqual([]);
  });

  it("drops pathless entries and trims the path", () => {
    expect(normalizeAreaPaths([{ path: "  " }, { label: "x" }, { path: " A\\B " }])).toEqual([
      { path: "A\\B", label: "B" },
    ]);
  });

  it("defaults a blank or missing label to the path's last segment", () => {
    expect(normalizeAreaPaths([{ path: "A\\B\\C", label: "  " }])).toEqual([
      { path: "A\\B\\C", label: "C" },
    ]);
  });

  it("keeps a supplied label and dedupes by path", () => {
    expect(
      normalizeAreaPaths([
        { path: "A\\B", label: "Custom" },
        { path: "A\\B", label: "Duplicate" },
      ]),
    ).toEqual([{ path: "A\\B", label: "Custom" }]);
  });
});
