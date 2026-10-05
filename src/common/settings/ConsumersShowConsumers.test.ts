import { describe, expect, it, vi } from "vitest";

import {
  exportCompactConfig,
  exportConfig,
  importConfig,
} from "../settings-transfer/AwesomeAdoConfig";

import { BrowserSyncSettingsStore } from "./BrowserSyncSettingsStore";
import {
  PersonalConsumersShowConsumers,
  normalizeConsumersShowConsumersQueryIds,
} from "./ConsumersShowConsumers";
import { normalizeSettings } from "./ExtensionSettings";

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
  return { storage, mode: new PersonalConsumersShowConsumers(settings) };
}

describe("personal Consumers View show-consumers mode", () => {
  it("remembers the mode per query in browser sync and forgets a query switched back", async () => {
    const { mode, storage } = harness();
    expect(await mode.read("first")).toBe(false);

    await mode.write("first", true);
    await mode.write("second", true);

    expect(await mode.read("first")).toBe(true);
    expect(storage.set).toHaveBeenLastCalledWith("settings.consumersShowConsumersQueryIds", [
      "first",
      "second",
    ]);

    await mode.write("first", false);

    expect(await mode.read("first")).toBe(false);
    expect(await mode.read("second")).toBe(true);
  });

  it("writes nothing when the query is already in the requested mode", async () => {
    const { mode, storage } = harness();
    await mode.write("query", false);
    await mode.write("query", true);
    await mode.write("query", true);

    expect(storage.set).toHaveBeenCalledTimes(1);
  });

  it("exports and imports the mode but keeps it out of the team payload", () => {
    const settings = normalizeSettings({ consumersShowConsumersQueryIds: ["query"] });

    expect(
      importConfig(exportConfig(settings, {})).settings.consumersShowConsumersQueryIds,
    ).toEqual(["query"]);
    expect(JSON.parse(exportCompactConfig(settings, {})).settings).not.toHaveProperty(
      "consumersShowConsumersQueryIds",
    );
  });

  it("skips an imported value that is not a list of query IDs", () => {
    const imported = importConfig(
      '{"settings":{"consumersShowConsumersQueryIds":{"q":true}},"enhancedQueries":{},"awesomeAdoConfigVersion":2}',
    );

    expect(imported.settings).not.toHaveProperty("consumersShowConsumersQueryIds");
    expect(imported.problems).toEqual([
      'The setting "consumersShowConsumersQueryIds" was skipped; expected a list of query IDs.',
    ]);
  });

  it("normalizes malformed stored values", () => {
    expect(normalizeSettings({}).consumersShowConsumersQueryIds).toEqual([]);
    expect(normalizeConsumersShowConsumersQueryIds({ q: true })).toEqual([]);
    expect(normalizeConsumersShowConsumersQueryIds([" a ", "", 7, "b", "a", null])).toEqual([
      "a",
      "b",
    ]);
  });
});
