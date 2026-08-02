import { describe, expect, it } from "vitest";

import {
  BOARD_COLUMN_COUNT,
  DEFAULT_BOARD_COLUMNS,
  DEFAULT_MARKER_TAGS,
  DEFAULT_SETTINGS,
  MAX_FUTURE_SPRINTS,
  MAX_PAST_SPRINTS,
  MIN_FUTURE_SPRINTS,
  MIN_PAST_SPRINTS,
  WORK_ITEM_MARKERS,
  isAdoConfigured,
  normalizeBoardColumns,
  normalizeFutureSprintsCount,
  normalizeMarkerTags,
  normalizePastSprintsCount,
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
});

describe("normalizeSettings - team, sprint, and collection fields", () => {
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

  it("clamps and defaults pastSprintsCount through normalizeSettings", () => {
    expect(normalizeSettings({ pastSprintsCount: 3 }).pastSprintsCount).toBe(3);
    expect(normalizeSettings({ pastSprintsCount: 99 }).pastSprintsCount).toBe(MAX_PAST_SPRINTS);
    expect(normalizeSettings({ pastSprintsCount: "x" }).pastSprintsCount).toBe(
      DEFAULT_SETTINGS.pastSprintsCount,
    );
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

  it("normalizes markerTags through normalizeSettings", () => {
    expect(normalizeSettings({}).markerTags).toEqual(DEFAULT_MARKER_TAGS);
    expect(
      normalizeSettings({ markerTags: { blocked: { tag: " Impediment ", commentTag: "[X]" } } })
        .markerTags.blocked,
    ).toEqual({ tag: "Impediment", commentTag: "[X]" });
  });

  it("normalizes per-sprint full area paths", () => {
    const settings = normalizeSettings({
      sprintAreaPaths: {
        "Project\\Sprint 1": {
          areaPaths: ["Project\\API", "Project\\Web", "Project\\API"],
          startDate: "2026-07-01T00:00:00Z",
          finishDate: "invalid",
        },
      },
    });

    expect(settings.sprintAreaPaths).toEqual({
      "Project\\Sprint 1": {
        areaPaths: ["Project\\API", "Project\\Web"],
        startDate: "2026-07-01T00:00:00Z",
        finishDate: null,
      },
    });
  });

  it("coerces the board columns to the fixed set, preserving stored titles by position", () => {
    // A never-set key means a fresh install, so the default titles appear...
    expect(normalizeSettings({}).boardColumns).toEqual([...DEFAULT_BOARD_COLUMNS]);
    // ...an empty or non-array value is likewise coerced back to the fixed default set...
    expect(normalizeSettings({ boardColumns: [] }).boardColumns).toEqual([
      ...DEFAULT_BOARD_COLUMNS,
    ]);
    expect(normalizeSettings({ boardColumns: "nope" }).boardColumns).toEqual([
      ...DEFAULT_BOARD_COLUMNS,
    ]);
    // ...and a stored list keeps each position's renamed title while filling the rest from defaults.
    expect(normalizeSettings({ boardColumns: ["Queue", "Doing"] }).boardColumns).toEqual([
      "Queue",
      "Doing",
      "Waiting",
      "Done",
      "Removed",
    ]);
  });
});

describe("normalizeBoardColumns", () => {
  it("returns the fixed default set for non-array or empty input", () => {
    expect(normalizeBoardColumns(undefined)).toEqual([...DEFAULT_BOARD_COLUMNS]);
    expect(normalizeBoardColumns("Active")).toEqual([...DEFAULT_BOARD_COLUMNS]);
    expect(normalizeBoardColumns([])).toEqual([...DEFAULT_BOARD_COLUMNS]);
  });

  it("always yields exactly BOARD_COLUMN_COUNT positions", () => {
    expect(normalizeBoardColumns(undefined)).toHaveLength(BOARD_COLUMN_COUNT);
    expect(normalizeBoardColumns(["only one"])).toHaveLength(BOARD_COLUMN_COUNT);
    expect(normalizeBoardColumns(["a", "b", "c", "d", "e", "extra", "more"])).toHaveLength(
      BOARD_COLUMN_COUNT,
    );
  });

  it("keeps a stored title at its position and trims it", () => {
    expect(normalizeBoardColumns([" Backlog ", "Doing"])).toEqual([
      "Backlog",
      "Doing",
      "Waiting",
      "Done",
      "Removed",
    ]);
  });

  it("fills a blank or missing position from that position's default title", () => {
    expect(normalizeBoardColumns(["Backlog", "  ", 7])).toEqual([
      "Backlog",
      "In Progress",
      "Waiting",
      "Done",
      "Removed",
    ]);
  });

  it("falls back to its own default when a title collides with an earlier position", () => {
    // The second column reusing the first's title would make two columns indistinguishable, so it
    // falls back to its own default instead.
    expect(normalizeBoardColumns(["Backlog", "backlog"])).toEqual([
      "Backlog",
      "In Progress",
      "Waiting",
      "Done",
      "Removed",
    ]);
  });

  it("suffixes when a position's own default is already taken by an earlier rename", () => {
    // Renaming column 0 to "Done" steals column 3's default, so column 3's fallback must not be
    // assumed free — the board resolves a column BY TITLE, and a duplicate silently aliases it.
    expect(normalizeBoardColumns(["Done", "done"])).toEqual([
      "Done",
      "In Progress",
      "Waiting",
      "Done (2)",
      "Removed",
    ]);
  });

  it("never yields two columns with the same title", () => {
    const cases: unknown[] = [
      ["Done", "done"],
      ["Done"],
      ["Removed"],
      ["Removed", "removed"],
      ["In Queue", "In Queue", "In Queue", "In Queue", "In Queue"],
      ["Waiting", "Waiting", "Waiting"],
    ];
    for (const stored of cases) {
      const columns = normalizeBoardColumns(stored);
      expect(columns).toHaveLength(BOARD_COLUMN_COUNT);
      expect(new Set(columns.map((column) => column.toLowerCase())).size).toBe(BOARD_COLUMN_COUNT);
    }
  });
});

describe("normalizeMarkerTags", () => {
  it("seeds the full defaults for a never-set or non-object value", () => {
    expect(normalizeMarkerTags(undefined)).toEqual(DEFAULT_MARKER_TAGS);
    expect(normalizeMarkerTags("nope")).toEqual(DEFAULT_MARKER_TAGS);
    expect(normalizeMarkerTags(null)).toEqual(DEFAULT_MARKER_TAGS);
  });

  it("has an entry for every configured marker", () => {
    const result = normalizeMarkerTags({});
    for (const { key } of WORK_ITEM_MARKERS) {
      // toBeDefined would pass for any wrong-but-present value; pin the actual default.
      expect(result[key]).toEqual(DEFAULT_MARKER_TAGS[key]);
    }
  });

  it("seeds only the missing markers from a partial object", () => {
    const result = normalizeMarkerTags({ blocked: { tag: "Impediment", commentTag: "[I]" } });
    expect(result.blocked).toEqual({ tag: "Impediment", commentTag: "[I]" });
    // A marker absent from the stored object still falls back to its default.
    expect(result.blockedByOtherTeam).toEqual(DEFAULT_MARKER_TAGS.blockedByOtherTeam);
  });

  it("trims each token and honors a deliberately blanked present entry", () => {
    const result = normalizeMarkerTags({
      interrupt: { tag: "  ", commentTag: "" },
      blockedByOtherTeam: { tag: "  Parked  ", commentTag: "  [W]  " },
    });
    // A present-but-blank entry stays blank rather than being reset to the default.
    expect(result.interrupt).toEqual({ tag: "", commentTag: "" });
    expect(result.blockedByOtherTeam).toEqual({ tag: "Parked", commentTag: "[W]" });
  });

  it("ignores non-string token fields", () => {
    const result = normalizeMarkerTags({ blocked: { tag: 7, commentTag: {} } });
    expect(result.blocked).toEqual({ tag: "", commentTag: "" });
  });
});

describe("isAdoConfigured", () => {
  const configured: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    currentTeam: { id: "t1", name: "Platform" },
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

describe("normalizePastSprintsCount", () => {
  it("defaults non-numbers and non-finite values", () => {
    expect(normalizePastSprintsCount(undefined)).toBe(DEFAULT_SETTINGS.pastSprintsCount);
    expect(normalizePastSprintsCount("3")).toBe(DEFAULT_SETTINGS.pastSprintsCount);
    expect(normalizePastSprintsCount(Number.NaN)).toBe(DEFAULT_SETTINGS.pastSprintsCount);
    expect(normalizePastSprintsCount(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_SETTINGS.pastSprintsCount,
    );
  });

  it("clamps to the inclusive bounds and truncates fractions", () => {
    expect(normalizePastSprintsCount(-5)).toBe(MIN_PAST_SPRINTS);
    expect(normalizePastSprintsCount(100)).toBe(MAX_PAST_SPRINTS);
    expect(normalizePastSprintsCount(3.9)).toBe(3);
  });
});

describe("normalizeWorkItemTypes", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeWorkItemTypes(undefined)).toEqual([]);
    expect(normalizeWorkItemTypes({ name: "Bug" })).toEqual([]);
  });

  it("trims name/color/icon and keeps a type even with no columns", () => {
    expect(
      normalizeWorkItemTypes([
        {
          name: "  Bug ",
          color: " CC293D ",
          icon: " https://cdn.example/bug.png ",
          columns: [],
        },
      ]),
    ).toEqual([{ name: "Bug", color: "CC293D", icon: "https://cdn.example/bug.png", columns: [] }]);
  });

  it("drops an icon that is not an https URL, because it is rendered with img.src", () => {
    // The value round-trips through synced storage and through config import, and both render sites
    // fall back to a glyph, so a non-https source is dropped rather than trusted.
    for (const icon of [
      "http://cdn.example/bug.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "blob:https://dev.azure.com/abc",
      "not a url",
      "/relative/bug.png",
      42,
    ]) {
      expect(normalizeWorkItemTypes([{ name: "Bug", icon, columns: [] }])[0]?.icon).toBe("");
    }
  });

  it("keeps a trimmed etaField when set and omits it when blank or missing", () => {
    expect(
      normalizeWorkItemTypes([
        {
          name: "Epic",
          columns: [],
          etaField: "  Microsoft.VSTS.Scheduling.TargetDate  ",
        },
      ]),
    ).toEqual([
      {
        name: "Epic",
        color: "",
        icon: "",
        columns: [],
        etaField: "Microsoft.VSTS.Scheduling.TargetDate",
      },
    ]);
    // A blank, whitespace-only, or non-string etaField is dropped so it never bloats storage.
    expect(normalizeWorkItemTypes([{ name: "Bug", columns: [], etaField: "   " }])).toEqual([
      { name: "Bug", color: "", icon: "", columns: [] },
    ]);
    expect(normalizeWorkItemTypes([{ name: "Task", columns: [], etaField: 42 }])).toEqual([
      { name: "Task", color: "", icon: "", columns: [] },
    ]);
  });

  it("keeps primary work on non-root types and always clears it from the root", () => {
    expect(
      normalizeWorkItemTypes([
        { name: "Epic", columns: [], isPrimaryWork: true },
        { name: "User Story", columns: [], isPrimaryWork: true },
        { name: "Task", columns: [], isPrimaryWork: false },
      ]),
    ).toEqual([
      { name: "Epic", color: "", icon: "", columns: [] },
      { name: "User Story", color: "", icon: "", columns: [], isPrimaryWork: true },
      { name: "Task", color: "", icon: "", columns: [] },
    ]);
  });

  it("drops non-boolean primary-work values", () => {
    expect(
      normalizeWorkItemTypes([
        { name: "Epic", columns: [] },
        { name: "Story", columns: [], isPrimaryWork: "yes" },
      ]),
    ).toEqual([
      { name: "Epic", color: "", icon: "", columns: [] },
      { name: "Story", color: "", icon: "", columns: [] },
    ]);
  });
});

describe("normalizeWorkItemTypes - name dedup and column normalization", () => {
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

describe("normalizeWorkItemTypes - child types", () => {
  /** Build a bare type carrying only the child links under test. */
  const type = (name: string, children?: unknown): Record<string, unknown> => ({
    name,
    columns: [],
    ...(children === undefined ? {} : { children }),
  });

  const childrenOf = (raw: unknown[]): (string[] | undefined)[] =>
    normalizeWorkItemTypes(raw).map((entry) => entry.children);

  it("keeps the stored order, since the first child is the default one a view creates", () => {
    expect(childrenOf([type("Epic", ["Feature", "Task"]), type("Feature"), type("Task")])).toEqual([
      ["Feature", "Task"],
      undefined,
      undefined,
    ]);
  });

  it("drops blanks, non-strings, repeats, and a self-reference", () => {
    expect(
      childrenOf([type("Epic", ["Feature", "  ", 7, "feature", "Epic"]), type("Feature")]),
    ).toEqual([["Feature"], undefined]);
  });

  it("resolves a link to the referenced type's own casing", () => {
    expect(childrenOf([type("Epic", ["feature"]), type("Feature")])).toEqual([
      ["Feature"],
      undefined,
    ]);
  });

  it("drops a link to a type the list does not contain", () => {
    expect(childrenOf([type("Epic", ["Ghost", "Feature"]), type("Feature")])).toEqual([
      ["Feature"],
      undefined,
    ]);
  });

  it("omits children entirely when every link is dropped", () => {
    expect(normalizeWorkItemTypes([type("Epic", ["Ghost"])])).toEqual([
      { name: "Epic", color: "", icon: "", columns: [] },
    ]);
    expect(normalizeWorkItemTypes([type("Epic", "not-an-array")])).toEqual([
      { name: "Epic", color: "", icon: "", columns: [] },
    ]);
  });

  it("breaks a direct cycle, keeping the first link seen", () => {
    expect(childrenOf([type("Epic", ["Feature"]), type("Feature", ["Epic"])])).toEqual([
      ["Feature"],
      undefined,
    ]);
  });

  it("breaks an indirect cycle so a recursive walk always terminates", () => {
    expect(
      childrenOf([
        type("Epic", ["Feature"]),
        type("Feature", ["User Story"]),
        type("User Story", ["Epic", "Task"]),
        type("Task"),
      ]),
    ).toEqual([["Feature"], ["User Story"], ["Task"], undefined]);
  });

  it("keeps two parents sharing one child, which is a diamond and not a cycle", () => {
    expect(childrenOf([type("Epic", ["Task"]), type("Feature", ["Task"]), type("Task")])).toEqual([
      ["Task"],
      ["Task"],
      undefined,
    ]);
  });
});
