import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOARD_COLUMNS,
  DEFAULT_SETTINGS,
  MAX_BOARD_COLUMNS,
  MAX_FUTURE_SPRINTS,
  MIN_FUTURE_SPRINTS,
  defaultAreaPathLabel,
  isAdoConfigured,
  normalizeAreaPaths,
  normalizeBoardColumns,
  normalizeFutureSprintsCount,
  normalizeSettings,
  normalizeWorkItemTypes,
  type ExtensionSettings,
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

  it("normalizes workItemTypes through normalizeSettings", () => {
    expect(
      normalizeSettings({
        workItemTypes: [{ name: "Bug", columns: [{ column: "Active", states: ["New"] }] }],
      }).workItemTypes,
    ).toEqual([
      { name: "Bug", color: "", icon: "", columns: [{ column: "Active", states: ["New"] }] },
    ]);
    expect(normalizeSettings({ workItemTypes: "nope" }).workItemTypes).toEqual([]);
  });

  it("seeds the default board columns for a first run and honors an explicit list", () => {
    // A never-set key means a fresh install, so the seed columns appear...
    expect(normalizeSettings({}).boardColumns).toEqual([...DEFAULT_BOARD_COLUMNS]);
    // ...but an explicit list — even an empty one the user cleared — is honored as-is.
    expect(normalizeSettings({ boardColumns: ["Queue", "Doing"] }).boardColumns).toEqual([
      "Queue",
      "Doing",
    ]);
    expect(normalizeSettings({ boardColumns: [] }).boardColumns).toEqual([]);
    expect(normalizeSettings({ boardColumns: "nope" }).boardColumns).toEqual([]);
  });
});

describe("normalizeBoardColumns", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeBoardColumns(undefined)).toEqual([]);
    expect(normalizeBoardColumns("Active")).toEqual([]);
  });

  it("trims, drops blanks, and dedupes case-insensitively", () => {
    expect(normalizeBoardColumns([" Active ", "active", "", "  ", 7, "Done"])).toEqual([
      "Active",
      "Done",
    ]);
  });

  it("caps the list at MAX_BOARD_COLUMNS", () => {
    const many = Array.from({ length: MAX_BOARD_COLUMNS + 3 }, (_, index) => `Col ${index}`);
    expect(normalizeBoardColumns(many)).toHaveLength(MAX_BOARD_COLUMNS);
  });
});

describe("isAdoConfigured", () => {
  const configured: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    currentTeam: { id: "t1", name: "Platform" },
    areaPaths: [{ path: "A\\B", label: "B" }],
    boardColumns: ["Active"],
    workItemTypes: [
      { name: "Bug", color: "", icon: "", columns: [{ column: "Active", states: ["New"] }] },
    ],
  };

  it("is true when every requirement is met", () => {
    expect(isAdoConfigured(configured)).toBe(true);
  });

  it("is false without a current team", () => {
    expect(isAdoConfigured({ ...configured, currentTeam: null })).toBe(false);
  });

  it("is false without any area path", () => {
    expect(isAdoConfigured({ ...configured, areaPaths: [] })).toBe(false);
  });

  it("is false without any board column", () => {
    expect(isAdoConfigured({ ...configured, boardColumns: [] })).toBe(false);
  });

  it("is false without any work item type", () => {
    expect(isAdoConfigured({ ...configured, workItemTypes: [] })).toBe(false);
  });

  it("is false when no work item type maps a state", () => {
    expect(
      isAdoConfigured({
        ...configured,
        workItemTypes: [{ name: "Bug", color: "", icon: "", columns: [] }],
      }),
    ).toBe(false);
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

describe("normalizeWorkItemTypes", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeWorkItemTypes(undefined)).toEqual([]);
    expect(normalizeWorkItemTypes({ name: "Bug" })).toEqual([]);
  });

  it("trims name/color/icon and keeps a type even with no columns", () => {
    expect(
      normalizeWorkItemTypes([{ name: "  Bug ", color: " CC293D ", icon: " url ", columns: [] }]),
    ).toEqual([{ name: "Bug", color: "CC293D", icon: "url", columns: [] }]);
  });

  it("drops nameless types and dedupes by case-insensitive name", () => {
    expect(
      normalizeWorkItemTypes([
        { name: "  " },
        { name: "Bug", columns: [] },
        { name: "bug", columns: [{ column: "Active", states: ["Active"] }] },
      ]),
    ).toEqual([{ name: "Bug", color: "", icon: "", columns: [] }]);
  });

  it("drops unknown columns, empty-state columns, and duplicate columns", () => {
    expect(
      normalizeWorkItemTypes([
        {
          name: "Bug",
          columns: [
            { column: "My Column", states: ["New"] },
            { column: "Active", states: ["  ", "New"] },
            { column: "Active", states: ["Resolved"] },
            { column: "Waiting", states: [] },
          ],
        },
      ]),
    ).toEqual([
      {
        name: "Bug",
        color: "",
        icon: "",
        // Any non-blank column name is allowed now; "New" is deduped to My Column, the second
        // "Active" is a duplicate column, and "Waiting" is dropped for having no states.
        columns: [
          { column: "My Column", states: ["New"] },
          { column: "Active", states: ["Resolved"] },
        ],
      },
    ]);
  });

  it("routes each state to a single column across the whole type", () => {
    expect(
      normalizeWorkItemTypes([
        {
          name: "Bug",
          columns: [
            { column: "Active", states: ["New", "Active"] },
            { column: "Resolved", states: ["active", "Resolved"] },
          ],
        },
      ]),
    ).toEqual([
      {
        name: "Bug",
        color: "",
        icon: "",
        columns: [
          { column: "Active", states: ["New", "Active"] },
          { column: "Resolved", states: ["Resolved"] },
        ],
      },
    ]);
  });
});
