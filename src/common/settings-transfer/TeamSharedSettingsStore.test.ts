import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";
import { DEFAULT_SETTINGS } from "../settings/ExtensionSettings";
import type { ISettingsStore } from "../settings/ISettingsStore";

import type {
  TeamConfigSyncResult,
  TeamConfigSynchronizer,
  TeamConfigWriter,
} from "./TeamConfigSynchronizer";
import { TeamSharedSettingsStore } from "./TeamSharedSettingsStore";

function harness(
  publish: TeamConfigSyncResult = { status: "published", workItemId: 7, bindingCount: 0 },
) {
  let settings = DEFAULT_SETTINGS;
  const local: ISettingsStore = {
    read: vi.fn(async () => settings),
    write: vi.fn(async (update) => {
      settings = { ...settings, ...update };
    }),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
  const publishSettings = vi.fn(async () => publish);
  const synchronizer = { publishSettings } as unknown as TeamConfigSynchronizer;
  const writer: TeamConfigWriter = { write: vi.fn() };
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  return {
    local,
    logger,
    publishSettings,
    settings: () => settings,
    subject: new TeamSharedSettingsStore(local, synchronizer, writer, logger),
  };
}

describe("TeamSharedSettingsStore", () => {
  it("publishes the proposed settings before recording the update locally", async () => {
    const { local, publishSettings, settings, subject } = harness();

    await subject.write({ futureSprintsCount: 6 });

    expect(publishSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ futureSprintsCount: 6 }),
    );
    expect(local.write).toHaveBeenCalledWith({ futureSprintsCount: 6 });
    expect(publishSettings.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(local.write).mock.invocationCallOrder[0] ?? 0,
    );
    expect(settings().futureSprintsCount).toBe(6);
  });

  it("serializes rapid edits so the second proposal includes the first", async () => {
    const { publishSettings, subject } = harness();

    await Promise.all([
      subject.write({ futureSprintsCount: 6 }),
      subject.write({ pastSprintsCount: 4 }),
    ]);

    expect(publishSettings).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ futureSprintsCount: 6, pastSprintsCount: 4 }),
    );
  });

  it("still writes locally when no team configuration is connected", async () => {
    const { local, subject } = harness({ status: "disconnected" });

    await subject.write({ organization: "contoso" });

    expect(local.write).toHaveBeenCalledWith({ organization: "contoso" });
  });

  it("leaves local settings unchanged and reports a rejected publication", async () => {
    const { local, logger, subject } = harness({
      status: "failed",
      workItemId: 7,
      error: "conflict",
    });

    await expect(subject.write({ project: "web" })).rejects.toThrow("conflict");

    expect(local.write).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Could not save team-shared settings",
      expect.any(Error),
    );
  });

  it("delegates reads and observations to the local store", async () => {
    const { local, subject } = harness();
    const listener = vi.fn();

    await expect(subject.read()).resolves.toEqual(DEFAULT_SETTINGS);
    subject.observe(listener);

    expect(local.read).toHaveBeenCalledOnce();
    expect(local.observe).toHaveBeenCalledWith(listener);
  });
});
