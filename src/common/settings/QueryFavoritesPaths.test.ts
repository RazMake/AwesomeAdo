import { describe, expect, it, vi } from "vitest";

import { FAVORITES_REFUSALS } from "../browser/Favorites";
import {
  exportCompactConfig,
  exportConfig,
  importConfig,
} from "../settings-transfer/AwesomeAdoConfig";

import { BrowserSyncSettingsStore } from "./BrowserSyncSettingsStore";
import { normalizeSettings } from "./ExtensionSettings";
import { PersonalQueryFavoritesPaths, normalizeQueryFavoritesPaths } from "./QueryFavoritesPaths";

function harness() {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    subscribe: () => () => {},
  };
  const settings = new BrowserSyncSettingsStore(storage);
  return { settings, storage, paths: new PersonalQueryFavoritesPaths(settings) };
}

describe("personal query Favorites paths", () => {
  it("persists separate per-query paths in browser sync and permits clearing", async () => {
    const { paths, storage } = harness();
    expect(await paths.read("first")).toBe("");
    await paths.write("first", "Work\\Projects");
    await paths.write("second", "Other");
    expect(await paths.read("first")).toBe("Work/Projects");
    expect(storage.set).toHaveBeenLastCalledWith("settings.queryFavoritesPaths", {
      first: "Work/Projects",
      second: "Other",
    });
    await paths.write("first", "");
    expect(await paths.read("first")).toBe("");
    expect(await paths.read("second")).toBe("Other");
  });

  it("refuses invalid paths before writing", async () => {
    const { paths, storage } = harness();
    await expect(paths.write("query", "../")).rejects.toThrow(FAVORITES_REFUSALS.invalidPath);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("exports and imports personal paths but excludes them from ADO payloads", () => {
    const settings = normalizeSettings({ queryFavoritesPaths: { query: "Work/Projects" } });
    expect(importConfig(exportConfig(settings, {})).settings.queryFavoritesPaths).toEqual({
      query: "Work/Projects",
    });
    expect(JSON.parse(exportCompactConfig(settings, {})).settings).not.toHaveProperty(
      "queryFavoritesPaths",
    );
    expect(
      importConfig('{"settings":{},"enhancedQueries":{},"awesomeAdoConfigVersion":2}').settings,
    ).not.toHaveProperty("queryFavoritesPaths");
  });

  it("normalizes malformed stored values without trusting inherited query keys", async () => {
    const inheritedPaths = Object.create({ inherited: "Ignored" }) as Record<string, unknown>;

    expect(normalizeSettings({ queryFavoritesPaths: [] }).queryFavoritesPaths).toEqual({});
    expect(
      normalizeSettings({
        queryFavoritesPaths: { bad: 1, root: "/", malformed: "Work//Projects", good: " Work\\X " },
      }).queryFavoritesPaths,
    ).toEqual({ good: "Work/X" });
    expect(normalizeQueryFavoritesPaths(inheritedPaths)).toEqual({});
    expect(await harness().paths.read("toString")).toBe("");
  });
});
