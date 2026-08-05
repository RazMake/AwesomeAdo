import { describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../bindings/IQueryBindingStore";
import type { ILogger } from "../logging/ILogger";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../settings/ExtensionSettings";
import type { ISettingsStore } from "../settings/ISettingsStore";

import { exportConfig } from "./AwesomeAdoConfig";
import type { TeamConfigSourceStore } from "./TeamConfigSourceStore";
import { createTeamSharedSettings } from "./createTeamSharedSettings";

function harness(remote: ExtensionSettings = DEFAULT_SETTINGS) {
  let stored: ExtensionSettings = DEFAULT_SETTINGS;
  const settings: ISettingsStore = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (update: Partial<ExtensionSettings>) => {
      stored = { ...stored, ...update };
    }),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
  const bindings = {
    read: vi.fn(async () => ({})),
    replaceAll: vi.fn(async () => {}),
  } as unknown as IQueryBindingStore;
  const source: TeamConfigSourceStore = {
    read: vi.fn(async () => 42),
    write: vi.fn(async () => {}),
  };
  const client = {
    read: vi.fn(async () => ({ ok: true as const, text: exportConfig(remote, {}) })),
    write: vi.fn(async () => ({ ok: true as const })),
  };
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  return {
    settings,
    client,
    stored: () => stored,
    subject: createTeamSharedSettings({ settings, bindings, source, client, logger }),
  };
}

describe("createTeamSharedSettings", () => {
  it("publishes an edit made through its store before that edit reaches storage", async () => {
    const { settings, client, subject } = harness();

    await subject.settings.write({ futureSprintsCount: 6 });

    expect(client.write).toHaveBeenCalledOnce();
    expect(settings.write).toHaveBeenCalledWith({ futureSprintsCount: 6 });
    expect(client.write.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(settings.write).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("leaves storage untouched when the work item refuses the edit", async () => {
    const { settings, client, subject } = harness();
    client.write.mockResolvedValue({ ok: false, error: "HTTP 412" } as never);

    await expect(subject.settings.write({ project: "web" })).rejects.toThrow("HTTP 412");

    expect(settings.write).not.toHaveBeenCalled();
  });

  it("applies a pulled configuration locally without publishing it back", async () => {
    const { settings, client, stored, subject } = harness({
      ...DEFAULT_SETTINGS,
      organization: "contoso",
    });

    await expect(subject.synchronizer.pull()).resolves.toMatchObject({ status: "updated" });

    expect(settings.write).toHaveBeenCalled();
    expect(stored().organization).toBe("contoso");
    expect(client.write).not.toHaveBeenCalled();
  });

  it("keeps a personal setting out of the team payload and out of a pull", async () => {
    const { stored, client, subject } = harness({ ...DEFAULT_SETTINGS, theme: "blue" });

    await subject.personal.write({ theme: "dark" });
    await subject.synchronizer.pull();

    // The reader's own choice survives a pull, and never reaches the work item.
    expect(stored().theme).toBe("dark");
    expect(client.write).not.toHaveBeenCalled();
  });

  it("writes an imported configuration locally without publishing it", async () => {
    const { settings, client, subject } = harness();

    await subject.local.applyLocally({ theme: "blue" });

    expect(settings.write).toHaveBeenCalledWith({ theme: "blue" });
    expect(client.write).not.toHaveBeenCalled();
  });
});
