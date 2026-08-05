import { describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../bindings/IQueryBindingStore";
import type { ILogger } from "../logging/ILogger";
import { DEFAULT_SETTINGS } from "../settings/ExtensionSettings";
import type { ISettingsStore } from "../settings/ISettingsStore";
import { localSettingsAccess } from "../settings/LocalSettingsAccess";

import type { TeamConfigSourceStore } from "./TeamConfigSourceStore";
import { TeamConfigSynchronizer, type TeamConfigWriter } from "./TeamConfigSynchronizer";
import { TeamSprintAreaPathStore } from "./TeamSprintAreaPathStore";

function harness() {
  let settings = DEFAULT_SETTINGS;
  const settingsStore: ISettingsStore = {
    read: vi.fn(async () => settings),
    write: vi.fn(async (update) => {
      settings = { ...settings, ...update };
    }),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
  const source: TeamConfigSourceStore = { read: vi.fn(async () => 42), write: vi.fn() };
  const bindings = {
    read: vi.fn(async () => ({})),
    replaceAll: vi.fn(),
  } as unknown as IQueryBindingStore;
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  const synchronizer = new TeamConfigSynchronizer(
    source,
    { read: vi.fn(async () => ({ ok: true as const, text: null })) },
    localSettingsAccess(settingsStore),
    bindings,
    logger,
  );
  const writer: TeamConfigWriter = { write: vi.fn(async () => ({ ok: true as const })) };
  return {
    store: new TeamSprintAreaPathStore(settingsStore, synchronizer, writer, logger),
    writer,
  };
}

describe("TeamSprintAreaPathStore", () => {
  it("publishes the full config after storing a sprint selection", async () => {
    const { store, writer } = harness();
    const selections = {
      "Project\\Sprint 1": { areaPaths: ["Project\\API"], startDate: null, finishDate: null },
    };

    await expect(store.save(selections)).resolves.toBe(true);
    expect(writer.write).toHaveBeenCalledWith(42, expect.stringContaining("sprintAreaPaths"));
  });
});
