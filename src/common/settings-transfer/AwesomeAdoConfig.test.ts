import { describe, expect, it } from "vitest";

import type { QueryBindings } from "../bindings/QueryBinding";
import {
  DEFAULT_SETTINGS,
  PERSONAL_SETTING_KEYS,
  type ExtensionSettings,
} from "../settings/ExtensionSettings";

import {
  CONFIG_FILE_NAME,
  CONFIG_FORMAT_VERSION,
  CONNECTION_FILE_NAME,
  exportCompactConfig,
  exportConfig,
  exportConnectionConfig,
  importConfig,
  mergeImportedSettings,
  type AwesomeAdoConfig,
  type AwesomeAdoConnectionConfig,
} from "./AwesomeAdoConfig";

const sampleSettings: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  theme: "dark",
  defaultView: "enhanced",
  currentTeam: { id: "team-1", name: "Contoso Team" },
  futureSprintsCount: 3,
  pastSprintsCount: 2,
  sprintAreaPaths: {
    "Project\\Sprint 1": {
      areaPaths: ["Project\\API", "Project\\Web"],
      startDate: "2026-07-01T00:00:00Z",
      finishDate: "2026-07-14T00:00:00Z",
    },
  },
};

const sampleBindings: QueryBindings = {
  "11111111-1111-1111-1111-111111111111": {
    view: "sprint",
    properties: { defaultAreaPaths: "Project\\API" },
    name: "My Sprint Query",
  },
  "22222222-2222-2222-2222-222222222222": {
    view: "projectTracking",
    properties: { orderingPolicy: "importance", weeks: "4" },
    name: "Roadmap",
  },
};

function withoutPrimaryWork(settings: ExtensionSettings): ExtensionSettings {
  return {
    ...settings,
    workItemTypes: settings.workItemTypes.map((type) => {
      const legacyType = { ...type };
      delete legacyType.isPrimaryWork;
      return legacyType;
    }),
  };
}

describe("exportConnectionConfig", () => {
  it("names the connection file distinctly from a full export", () => {
    expect(CONNECTION_FILE_NAME).toBe("AwesomeADO.connection.config");
    expect(CONNECTION_FILE_NAME).not.toBe(CONFIG_FILE_NAME);
  });

  it("carries the work item plus only what is needed to reach it", () => {
    const parsed = JSON.parse(
      exportConnectionConfig({ ...sampleSettings, organization: "contoso", project: "Web" }, 12345),
    ) as AwesomeAdoConnectionConfig;

    expect(parsed.configScope).toBe("connection");
    expect(parsed.teamConfigWorkItemId).toBe(12345);
    expect(parsed.settings).toEqual({ organization: "contoso", project: "Web" });
  });

  it("carries no snapshot of the configuration the work item itself supplies", () => {
    // Handing over the full file would also hand over a copy that starts drifting the moment the
    // team publishes again.
    const parsed = JSON.parse(exportConnectionConfig(sampleSettings, 1)) as Record<string, unknown>;

    expect(parsed).not.toHaveProperty("enhancedQueries");
    expect(parsed.settings).not.toHaveProperty("theme");
    expect(parsed.settings).not.toHaveProperty("workItemTypes");
  });
});

describe("importConfig of a connection file", () => {
  it("applies the connection without claiming authority over the reader's bindings", () => {
    const imported = importConfig(
      exportConnectionConfig({ ...sampleSettings, organization: "contoso", project: "Web" }, 777),
    );

    expect(imported.teamConfigWorkItemId).toBe(777);
    expect(imported.replacesBindings).toBe(false);
    expect(imported.enhancedQueries).toEqual({});
    expect(imported.settings.organization).toBe("contoso");
    expect(imported.problems).toEqual([]);
  });

  it("reports a connection file that names no work item", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: CONFIG_FORMAT_VERSION,
        configScope: "connection",
        settings: { organization: "contoso" },
      }),
    );

    expect(imported.problems).toContain(
      "The selected connection file does not name a configuration work item ID.",
    );
  });

  it("still rejects a connection file with no settings section at all", () => {
    expect(() =>
      importConfig(JSON.stringify({ awesomeAdoConfigVersion: 2, configScope: "connection" })),
    ).toThrow(/not a usable AwesomeADO connection/);
  });

  it("treats a full export as authoritative about bindings", () => {
    expect(importConfig(exportConfig(sampleSettings, sampleBindings)).replacesBindings).toBe(true);
  });
});

describe("exportConfig", () => {
  it("names the export file AwesomeADO.config", () => {
    expect(CONFIG_FILE_NAME).toBe("AwesomeADO.config");
  });

  it("stamps the format version and round-trips settings plus enhanced queries", () => {
    const parsed = JSON.parse(exportConfig(sampleSettings, sampleBindings)) as AwesomeAdoConfig;

    expect(parsed.awesomeAdoConfigVersion).toBe(CONFIG_FORMAT_VERSION);
    expect(parsed.settings.theme).toBe("dark");
    expect(parsed.settings.currentTeam).toEqual({ id: "team-1", name: "Contoso Team" });
    expect(parsed.settings.sprintAreaPaths["Project\\Sprint 1"]?.areaPaths).toEqual([
      "Project\\API",
      "Project\\Web",
    ]);
    expect(parsed.enhancedQueries).toEqual(sampleBindings);
  });

  it("produces indented JSON so an exported file is human-readable", () => {
    expect(exportConfig(sampleSettings, sampleBindings)).toContain("\n  ");
  });

  it("produces compact JSON for the team configuration work item", () => {
    const compact = exportCompactConfig(sampleSettings, sampleBindings);

    expect(compact).not.toContain("\n");
    expect(compact).toBe(JSON.stringify(JSON.parse(compact)));
    expect(JSON.parse(compact)).not.toHaveProperty("teamConfigWorkItemId");
    expect(JSON.parse(compact).settings.sprintAreaPaths).toEqual(sampleSettings.sprintAreaPaths);
    expect(
      JSON.parse(compact).enhancedQueries["11111111-1111-1111-1111-111111111111"],
    ).toHaveProperty("properties.defaultAreaPaths", "Project\\API");
  });

  it("keeps the personal settings out of the team payload but in a file export", () => {
    // A file backs up one person's own configuration, so it keeps them; the work item is the team's.
    const compact = JSON.parse(exportCompactConfig(sampleSettings, sampleBindings));
    const file = JSON.parse(exportConfig(sampleSettings, sampleBindings)) as AwesomeAdoConfig;

    for (const key of PERSONAL_SETTING_KEYS) {
      expect(compact.settings).not.toHaveProperty(key);
      expect(file.settings).toHaveProperty(key);
    }
    // The team's own settings still travel, or "excluded" would just mean "nothing published".
    expect(compact.settings.currentTeam).toEqual(sampleSettings.currentTeam);
  });

  it("includes the trusted team configuration work item in a file export", () => {
    const text = exportConfig(sampleSettings, sampleBindings, 12345);

    expect(JSON.parse(text)).toHaveProperty("teamConfigWorkItemId", 12345);
    expect(importConfig(text).teamConfigWorkItemId).toBe(12345);
  });

  it("normalizes values so an export is always a clean snapshot", () => {
    const dirtySettings = { ...sampleSettings, futureSprintsCount: 999 } as ExtensionSettings;

    const parsed = JSON.parse(exportConfig(dirtySettings, sampleBindings)) as AwesomeAdoConfig;

    // 999 is out of range and gets clamped by the settings normalizer.
    expect(parsed.settings.futureSprintsCount).toBeLessThan(999);
  });
});

describe("importConfig - files it cannot use at all", () => {
  it("rejects a file that carries a version marker but no payload", () => {
    // An import replaces BOTH stores wholesale, so normalizing an absent payload into defaults
    // would destroy the user's real configuration and report success.
    expect(() => importConfig(JSON.stringify({ awesomeAdoConfigVersion: 1 }))).toThrow(
      /not a complete AwesomeADO configuration/,
    );
  });

  it("rejects a file that carries only its settings section", () => {
    expect(() => importConfig(JSON.stringify({ settings: { theme: "blue" } }))).toThrow(
      /not a complete AwesomeADO configuration/,
    );
  });

  it("rejects a file that carries only its enhancedQueries section", () => {
    expect(() =>
      importConfig(JSON.stringify({ enhancedQueries: { q: { view: "sprint", properties: {} } } })),
    ).toThrow(/not a complete AwesomeADO configuration/);
  });

  it("rejects a file whose sections are present but not objects", () => {
    expect(() => importConfig(JSON.stringify({ settings: [], enhancedQueries: {} }))).toThrow(
      /not a complete AwesomeADO configuration/,
    );
    expect(() => importConfig(JSON.stringify({ settings: {}, enhancedQueries: null }))).toThrow(
      /not a complete AwesomeADO configuration/,
    );
  });

  it("rejects text that is not valid JSON", () => {
    expect(() => importConfig("not json")).toThrow(/not valid JSON/);
  });

  it("rejects a JSON array", () => {
    expect(() => importConfig("[1, 2, 3]")).toThrow(/not an AwesomeADO configuration/);
  });

  it("rejects JSON null", () => {
    expect(() => importConfig("null")).toThrow(/not an AwesomeADO configuration/);
  });

  it("rejects an unrelated JSON object with no recognizable sections", () => {
    expect(() => importConfig(JSON.stringify({ hello: "world" }))).toThrow(
      /not a complete AwesomeADO configuration/,
    );
  });
});

describe("importConfig - salvaging what a file does offer", () => {
  it("round-trips an exported file back into settings and enhanced queries", () => {
    const text = exportConfig(sampleSettings, sampleBindings);

    const imported = importConfig(text);

    expect(imported.settings.theme).toBe("dark");
    expect(imported.settings.currentTeam).toEqual({ id: "team-1", name: "Contoso Team" });
    expect(imported.enhancedQueries).toEqual(sampleBindings);
    expect(imported.problems).toEqual([]);
  });

  it("applies only the settings a sparse file actually carries", () => {
    // A partial keeps every setting the file omitted at whatever the user has configured today,
    // instead of resetting it to a default the file never asked for.
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: { theme: "blue" },
        enhancedQueries: {},
      }),
    );

    expect(imported.settings).toEqual({ theme: "blue" });
    expect(imported.enhancedQueries).toEqual({});
    expect(imported.problems).toEqual([]);
  });

  it("ignores the retired areaPaths field from a legacy file", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: { theme: "blue", areaPaths: [{ path: "Web\\Api", label: "Api" }] },
        enhancedQueries: {},
      }),
    );

    expect(imported.settings).toEqual({ theme: "blue" });
    expect(imported.problems).toEqual([]);
  });

  it("imports the valid settings and reports the ones it skipped", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: { theme: "chartreuse", defaultView: "enhanced", futureSprintsCount: "lots" },
        enhancedQueries: {},
      }),
    );

    expect(imported.settings).toEqual({ defaultView: "enhanced" });
    expect(imported.problems).toEqual([
      expect.stringContaining('"theme" was skipped'),
      expect.stringContaining('"futureSprintsCount" was skipped'),
    ]);
  });

  it("normalizes the settings it accepts so an imported value is never stored raw", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: { futureSprintsCount: 999 },
        enhancedQueries: {},
      }),
    );

    expect(imported.settings.futureSprintsCount).toBeLessThan(999);
    expect(imported.problems).toEqual([]);
  });

  it("carries the Azure DevOps organization and project, and reports a non-text one", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 2,
        settings: { organization: " contoso ", project: 7 },
        enhancedQueries: {},
      }),
    );

    expect(imported.settings).toEqual({ organization: "contoso" });
    expect(imported.problems).toEqual([expect.stringContaining('"project" was skipped')]);
  });
});

describe("importConfig - judging the format stamp", () => {
  it("reports a file that is not stamped by AwesomeADO but still imports what it holds", () => {
    const imported = importConfig(
      JSON.stringify({ settings: { theme: "blue" }, enhancedQueries: {} }),
    );

    expect(imported.settings).toEqual({ theme: "blue" });
    expect(imported.problems).toEqual([expect.stringContaining("awesomeAdoConfigVersion")]);
  });

  it("reports a file written by a newer build but still imports what it recognizes", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: CONFIG_FORMAT_VERSION + 1,
        settings: { theme: "blue" },
        enhancedQueries: {},
      }),
    );

    expect(imported.settings).toEqual({ theme: "blue" });
    expect(imported.problems).toEqual([expect.stringContaining("newer than this version")]);
  });
});

describe("importConfig - Primary Work migration", () => {
  it("distinguishes legacy omission from an authoritative clear", () => {
    const current: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      workItemTypes: [
        { name: "Epic", color: "", icon: "", columns: [], children: ["User Story"] },
        { name: "User Story", color: "", icon: "", columns: [], isPrimaryWork: true },
      ],
    };
    const settingsWithoutClassification = withoutPrimaryWork(current);
    const legacy = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: settingsWithoutClassification,
        enhancedQueries: {},
      }),
    );
    const currentFormat = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: CONFIG_FORMAT_VERSION,
        settings: settingsWithoutClassification,
        enhancedQueries: {},
      }),
    );

    expect(mergeImportedSettings(current, legacy).workItemTypes?.[1]?.isPrimaryWork).toBe(true);
    expect(mergeImportedSettings(current, currentFormat).workItemTypes?.[1]?.isPrimaryWork).toBe(
      undefined,
    );
  });
});

describe("importConfig - salvaging enhanced queries", () => {
  it("keeps valid bindings, drops malformed ones, and reports each one it dropped", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: {},
        enhancedQueries: { good: { view: "sprint", properties: {} }, bad: { view: 42 } },
      }),
    );

    expect(imported.enhancedQueries.good).toBeDefined();
    expect(imported.enhancedQueries.bad).toBeUndefined();
    expect(imported.problems).toEqual([expect.stringContaining('"bad" was skipped')]);
  });

  it("keeps a binding whose view settings are not all text, and reports the ones dropped", () => {
    const imported = importConfig(
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: {},
        enhancedQueries: { q: { view: "sprint", properties: { weeks: 4, order: "title" } } },
      }),
    );

    expect(imported.enhancedQueries.q).toEqual({ view: "sprint", properties: { order: "title" } });
    expect(imported.problems).toEqual([
      expect.stringContaining('view settings of the enhanced query "q"'),
    ]);
  });

  it("keeps a __proto__ key from silently discarding the binding it names", () => {
    // Written as raw JSON: a `__proto__` key in an object LITERAL sets the prototype instead of
    // adding an entry, so the fixture has to come from the parser, exactly as a real file would.
    const imported = importConfig(
      '{"awesomeAdoConfigVersion":1,"settings":{},"enhancedQueries":' +
        '{"__proto__":{"view":"sprint","properties":{}},"good":{"view":"sprint","properties":{}}}}',
    );

    expect(Object.keys(imported.enhancedQueries).sort()).toEqual(["__proto__", "good"]);
    expect(Object.getPrototypeOf(imported.enhancedQueries)).toBeNull();
  });
});
