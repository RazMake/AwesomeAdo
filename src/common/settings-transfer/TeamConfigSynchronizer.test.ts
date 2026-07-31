import { describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../bindings/IQueryBindingStore";
import type { QueryBindings } from "../bindings/QueryBinding";
import type { ILogger } from "../logging/ILogger";
import { DEFAULT_SETTINGS } from "../settings/ExtensionSettings";
import type { ISettingsStore } from "../settings/ISettingsStore";

import { exportConfig } from "./AwesomeAdoConfig";
import type { TeamConfigSourceStore } from "./TeamConfigSourceStore";
import {
  TeamConfigSynchronizer,
  type TeamConfigReader,
  type TeamConfigWriter,
} from "./TeamConfigSynchronizer";

const bindings: QueryBindings = {
  query: { view: "sprint", properties: { weeks: "2" } },
};

function makeHarness(sourceId: number | null = 42, currentBindings: QueryBindings = {}) {
  const sourceStore: TeamConfigSourceStore = {
    read: vi.fn(async () => sourceId),
    write: vi.fn(async () => {}),
  };
  const settingsStore: ISettingsStore = {
    read: vi.fn(async () => DEFAULT_SETTINGS),
    write: vi.fn(async () => {}),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
  const bindingStore: IQueryBindingStore = {
    read: vi.fn(async () => currentBindings),
    bind: vi.fn(async () => {}),
    unbind: vi.fn(async () => {}),
    replaceAll: vi.fn(async () => {}),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
  const reader: TeamConfigReader = {
    read: vi.fn(async () => ({
      ok: true as const,
      text: exportConfig(DEFAULT_SETTINGS, bindings),
    })),
  };
  const logger: ILogger = {
    info: vi.fn(),
    error: vi.fn(),
  };
  return {
    sourceStore,
    settingsStore,
    bindingStore,
    reader,
    logger,
    synchronizer: new TeamConfigSynchronizer(
      sourceStore,
      reader,
      settingsStore,
      bindingStore,
      logger,
    ),
  };
}

describe("TeamConfigSynchronizer pull", () => {
  it("replaces settings and bindings from a valid authoritative description", async () => {
    const harness = makeHarness();

    await expect(harness.synchronizer.pull()).resolves.toEqual({
      status: "updated",
      workItemId: 42,
      bindingCount: 1,
    });
    expect(harness.settingsStore.write).toHaveBeenCalledWith(DEFAULT_SETTINGS);
    expect(harness.bindingStore.replaceAll).toHaveBeenCalledWith(bindings);
  });

  it("does not apply a malformed or partially valid description", async () => {
    const harness = makeHarness();
    vi.mocked(harness.reader.read).mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: { theme: "invalid" },
        enhancedQueries: {},
      }),
    });

    const result = await harness.synchronizer.pull();

    expect(result.status).toBe("failed");
    expect(harness.settingsStore.write).not.toHaveBeenCalled();
    expect(harness.bindingStore.replaceAll).not.toHaveBeenCalled();
    expect(harness.logger.error).toHaveBeenCalledOnce();
  });

  it("keeps local configuration when the connected item has no shared configuration", async () => {
    const harness = makeHarness();
    vi.mocked(harness.reader.read).mockResolvedValue({ ok: true, text: null });

    await expect(harness.synchronizer.pull()).resolves.toEqual({
      status: "empty",
      workItemId: 42,
    });
    expect(harness.settingsStore.write).not.toHaveBeenCalled();
    expect(harness.bindingStore.replaceAll).not.toHaveBeenCalled();
    expect(harness.logger.error).not.toHaveBeenCalled();
  });

  it("coalesces concurrent pulls and does nothing while disconnected", async () => {
    const disconnected = makeHarness(null);
    await expect(disconnected.synchronizer.pull()).resolves.toEqual({ status: "disconnected" });
    expect(disconnected.reader.read).not.toHaveBeenCalled();

    const harness = makeHarness();
    const first = harness.synchronizer.pull();
    const second = harness.synchronizer.pull();
    expect(first).toBe(second);
    await first;
    expect(harness.reader.read).toHaveBeenCalledOnce();
  });

  it("does not rewrite or log an unchanged snapshot", async () => {
    const harness = makeHarness(42, bindings);

    await expect(harness.synchronizer.pull()).resolves.toEqual({
      status: "unchanged",
      workItemId: 42,
      bindingCount: 1,
    });
    expect(harness.settingsStore.write).not.toHaveBeenCalled();
    expect(harness.bindingStore.replaceAll).not.toHaveBeenCalled();
    expect(harness.logger.info).not.toHaveBeenCalled();
  });

  it("never lets a remote payload replace its trusted source", async () => {
    const harness = makeHarness();
    vi.mocked(harness.reader.read).mockResolvedValue({
      ok: true,
      text: exportConfig(DEFAULT_SETTINGS, bindings, 999),
    });

    await harness.synchronizer.pull();

    expect(harness.sourceStore.write).not.toHaveBeenCalled();
  });
});

describe("TeamConfigSynchronizer publish", () => {
  it("publishes the current full configuration", async () => {
    const harness = makeHarness();
    vi.mocked(harness.bindingStore.read).mockResolvedValue(bindings);
    const writer: TeamConfigWriter = { write: vi.fn(async () => ({ ok: true as const })) };

    await expect(harness.synchronizer.publish(writer)).resolves.toEqual({
      status: "published",
      workItemId: 42,
      bindingCount: 1,
    });
    expect(writer.write).toHaveBeenCalledOnce();
    const published = vi.mocked(writer.write).mock.calls[0]?.[1] ?? "";
    expect(published).not.toContain("\n");
    expect(published).toBe(JSON.stringify(JSON.parse(published)));
    expect(JSON.parse(published)).toMatchObject({
      settings: DEFAULT_SETTINGS,
      enhancedQueries: bindings,
    });
  });

  it("reports writer failures without throwing", async () => {
    const harness = makeHarness();
    const writer: TeamConfigWriter = {
      write: vi.fn(async () => ({ ok: false, error: "HTTP 412" })),
    };

    const result = await harness.synchronizer.publish(writer);

    expect(result).toEqual({ status: "failed", workItemId: 42, error: "HTTP 412" });
    expect(harness.logger.error).toHaveBeenCalledOnce();
  });
});
