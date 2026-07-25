import { describe, expect, it } from "vitest";

import type { QueryBindings } from "../bindings/QueryBinding";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../settings/ExtensionSettings";

import {
  CONFIG_FILE_NAME,
  CONFIG_FORMAT_VERSION,
  exportConfig,
  importConfig,
  type AwesomeAdoConfig,
} from "./AwesomeAdoConfig";

const sampleSettings: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  theme: "dark",
  defaultView: "enhanced",
  currentTeam: { id: "team-1", name: "Contoso Team" },
  futureSprintsCount: 3,
  pastSprintsCount: 2,
};

const sampleBindings: QueryBindings = {
  "11111111-1111-1111-1111-111111111111": {
    view: "sprint",
    properties: {},
    name: "My Sprint Query",
  },
  "22222222-2222-2222-2222-222222222222": {
    view: "projectTracking",
    properties: { orderingPolicy: "importance", weeks: "4" },
    name: "Roadmap",
  },
};

describe("exportConfig", () => {
  it("names the export file AwesomeADO.config", () => {
    expect(CONFIG_FILE_NAME).toBe("AwesomeADO.config");
  });

  it("stamps the format version and round-trips settings plus enhanced queries", () => {
    const parsed = JSON.parse(exportConfig(sampleSettings, sampleBindings)) as AwesomeAdoConfig;

    expect(parsed.awesomeAdoConfigVersion).toBe(CONFIG_FORMAT_VERSION);
    expect(parsed.settings.theme).toBe("dark");
    expect(parsed.settings.currentTeam).toEqual({ id: "team-1", name: "Contoso Team" });
    expect(parsed.enhancedQueries).toEqual(sampleBindings);
  });

  it("produces indented JSON so an exported file is human-readable", () => {
    expect(exportConfig(sampleSettings, sampleBindings)).toContain("\n  ");
  });

  it("normalizes values so an export is always a clean snapshot", () => {
    const dirtySettings = { ...sampleSettings, futureSprintsCount: 999 } as ExtensionSettings;

    const parsed = JSON.parse(exportConfig(dirtySettings, sampleBindings)) as AwesomeAdoConfig;

    // 999 is out of range and gets clamped by the settings normalizer.
    expect(parsed.settings.futureSprintsCount).toBeLessThan(999);
  });
});

describe("importConfig", () => {
  it("round-trips an exported file back into settings and enhanced queries", () => {
    const text = exportConfig(sampleSettings, sampleBindings);

    const imported = importConfig(text);

    expect(imported.settings.theme).toBe("dark");
    expect(imported.settings.currentTeam).toEqual({ id: "team-1", name: "Contoso Team" });
    expect(imported.enhancedQueries).toEqual(sampleBindings);
  });

  it("defaults missing sections rather than failing when a marker is present", () => {
    const imported = importConfig(JSON.stringify({ awesomeAdoConfigVersion: 1 }));

    expect(imported.settings).toEqual({
      ...DEFAULT_SETTINGS,
      areaPaths: [],
      boardColumns: DEFAULT_SETTINGS.boardColumns,
    });
    expect(imported.enhancedQueries).toEqual({});
  });

  it("accepts a file recognized only by its settings section", () => {
    const imported = importConfig(JSON.stringify({ settings: { theme: "blue" } }));

    expect(imported.settings.theme).toBe("blue");
  });

  it("accepts a file recognized only by its enhancedQueries section", () => {
    const imported = importConfig(
      JSON.stringify({ enhancedQueries: { q: { view: "sprint", properties: {} } } }),
    );

    expect(imported.enhancedQueries.q?.view).toBe("sprint");
  });

  it("drops malformed bindings while keeping valid ones", () => {
    const imported = importConfig(
      JSON.stringify({
        settings: {},
        enhancedQueries: { good: { view: "sprint", properties: {} }, bad: { view: 42 } },
      }),
    );

    expect(imported.enhancedQueries.good).toBeDefined();
    expect(imported.enhancedQueries.bad).toBeUndefined();
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

  it("rejects an unrelated JSON object with no recognizable marker", () => {
    expect(() => importConfig(JSON.stringify({ hello: "world" }))).toThrow(
      /not an AwesomeADO configuration/,
    );
  });
});
