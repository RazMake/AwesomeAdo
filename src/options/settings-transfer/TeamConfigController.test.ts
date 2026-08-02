import { describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBindings } from "../../common/bindings/QueryBinding";
import type { ILogger } from "../../common/logging/ILogger";
import { DEFAULT_SETTINGS } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";
import { exportConfig } from "../../common/settings-transfer/AwesomeAdoConfig";
import type { TeamConfigSourceStore } from "../../common/settings-transfer/TeamConfigSourceStore";
import {
  TeamConfigSynchronizer,
  type TeamConfigReader,
  type TeamConfigWriter,
} from "../../common/settings-transfer/TeamConfigSynchronizer";

import { TeamConfigController, type TeamConfigElements } from "./TeamConfigController";

const sharedBindings: QueryBindings = {
  query: { view: "sprint", properties: {} },
};

function makeElements(): TeamConfigElements {
  return {
    workItemId: document.createElement("input"),
    workItemLink: document.createElement("a"),
    connectButton: document.createElement("button"),
    pullButton: document.createElement("button"),
    publishButton: document.createElement("button"),
    disconnectButton: document.createElement("button"),
    status: document.createElement("p"),
  };
}

function makeHarness(initialSource: number | null = null) {
  let source = initialSource;
  const sourceStore: TeamConfigSourceStore = {
    read: vi.fn(async () => source),
    write: vi.fn(async (value: number | null) => {
      source = value;
    }),
  };
  const settingsStore: ISettingsStore = {
    read: vi.fn(async () => DEFAULT_SETTINGS),
    write: vi.fn(async () => {}),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
  const bindingStore: IQueryBindingStore = {
    read: vi.fn(async () => ({})),
    bind: vi.fn(async () => {}),
    unbind: vi.fn(async () => {}),
    replaceAll: vi.fn(async () => {}),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
  const reader: TeamConfigReader = {
    read: vi.fn(async () => ({
      ok: true as const,
      text: exportConfig(DEFAULT_SETTINGS, sharedBindings),
    })),
  };
  const writer: TeamConfigWriter = {
    write: vi.fn(async () => ({
      ok: true as const,
      workItemUrl: "https://dev.azure.com/Contoso/Project/_workitems/edit/42",
    })),
  };
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  const elements = makeElements();
  const errors: unknown[] = [];
  const onPulled = vi.fn();
  const resolveWorkItemUrl = vi.fn(
    async (workItemId: number) =>
      `https://dev.azure.com/Contoso/Project/_workitems/edit/${workItemId}`,
  );
  const synchronizer = new TeamConfigSynchronizer(
    sourceStore,
    reader,
    settingsStore,
    bindingStore,
    logger,
  );
  const controller = new TeamConfigController(
    sourceStore,
    synchronizer,
    writer,
    elements,
    (error) => errors.push(error),
    onPulled,
    resolveWorkItemUrl,
  );
  return {
    controller,
    sourceStore,
    settingsStore,
    bindingStore,
    reader,
    writer,
    elements,
    errors,
    onPulled,
    resolveWorkItemUrl,
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("TeamConfigController connection rendering", () => {
  it("loads a saved source and enables team actions", async () => {
    const harness = makeHarness(42);

    await harness.controller.init();

    expect(harness.elements.workItemId.value).toBe("42");
    expect(harness.elements.workItemId.hidden).toBe(true);
    expect(harness.elements.workItemLink.hidden).toBe(false);
    expect(harness.elements.workItemLink.textContent).toBe("42");
    expect(harness.elements.workItemLink.href).toBe(
      "https://dev.azure.com/Contoso/Project/_workitems/edit/42",
    );
    expect(harness.elements.workItemLink.target).toBe("_blank");
    expect(harness.elements.workItemLink.rel).toBe("noopener noreferrer");
    expect(harness.elements.connectButton.textContent).toBe("Connected");
    expect(harness.elements.connectButton.disabled).toBe(true);
    expect(harness.elements.pullButton.disabled).toBe(false);
    expect(harness.elements.publishButton.disabled).toBe(false);
    expect(harness.elements.disconnectButton.disabled).toBe(false);
  });

  it("enables only Connect when no source is configured", async () => {
    const harness = makeHarness();

    await harness.controller.init();

    expect(harness.elements.connectButton.textContent).toBe("Connect");
    expect(harness.elements.workItemId.hidden).toBe(false);
    expect(harness.elements.workItemLink.hidden).toBe(true);
    expect(harness.elements.connectButton.disabled).toBe(false);
    expect(harness.elements.disconnectButton.disabled).toBe(true);
  });
});

describe("TeamConfigController connection actions", () => {
  it("connects and applies the authoritative configuration", async () => {
    const harness = makeHarness();
    await harness.controller.init();
    harness.elements.workItemId.value = "42";

    harness.elements.connectButton.click();
    await flush();

    expect(harness.sourceStore.write).toHaveBeenCalledWith(42);
    expect(harness.reader.read).toHaveBeenCalledWith(42);
    expect(harness.elements.workItemId.hidden).toBe(true);
    expect(harness.elements.workItemLink.href).toBe(
      "https://dev.azure.com/Contoso/Project/_workitems/edit/42",
    );
    expect(harness.bindingStore.replaceAll).toHaveBeenCalledWith(sharedBindings);
    expect(harness.onPulled).toHaveBeenCalledOnce();
    expect(harness.elements.status.textContent).toContain("Pulled 1 enhanced query");
  });

  it("rejects an invalid id without changing the source", async () => {
    const harness = makeHarness();
    await harness.controller.init();
    harness.elements.workItemId.value = "0";

    harness.elements.connectButton.click();
    await flush();

    expect(harness.sourceStore.write).not.toHaveBeenCalled();
    expect(harness.elements.status.classList.contains("card__hint--error")).toBe(true);
  });

  it("shows a neutral connected message when no shared configuration exists", async () => {
    const harness = makeHarness(42);
    vi.mocked(harness.reader.read).mockResolvedValue({ ok: true, text: null });
    await harness.controller.init();

    harness.elements.pullButton.click();
    await flush();

    expect(harness.elements.status.textContent).toBe(
      "Connected to work item 42, but no shared configuration found yet.",
    );
    expect(harness.elements.status.classList.contains("card__hint--error")).toBe(false);
    expect(harness.errors).toHaveLength(0);
    expect(harness.onPulled).not.toHaveBeenCalled();
  });

  it("shows a red tile message when shared configuration text is invalid", async () => {
    const harness = makeHarness(42);
    vi.mocked(harness.reader.read).mockResolvedValue({ ok: true, text: "not json" });
    await harness.controller.init();

    harness.elements.pullButton.click();
    await flush();

    expect(harness.elements.status.textContent).toContain("not valid JSON");
    expect(harness.elements.status.classList.contains("card__hint--error")).toBe(true);
    expect(harness.errors).toHaveLength(0);
  });

  it("disconnects without deleting the locally pulled configuration", async () => {
    const harness = makeHarness(42);
    await harness.controller.init();

    harness.elements.disconnectButton.click();
    await flush();

    expect(harness.sourceStore.write).toHaveBeenCalledWith(null);
    expect(harness.bindingStore.replaceAll).not.toHaveBeenCalled();
    expect(harness.elements.connectButton.textContent).toBe("Connect");
    expect(harness.elements.connectButton.disabled).toBe(false);
    expect(harness.elements.pullButton.disabled).toBe(true);
    expect(harness.elements.disconnectButton.disabled).toBe(true);
  });
});

describe("TeamConfigController publishing", () => {
  it("links the published work item ID to Azure DevOps", async () => {
    const harness = makeHarness(42);
    await harness.controller.init();

    harness.elements.publishButton.click();
    await flush();

    const link = harness.elements.status.querySelector("a");
    expect(harness.elements.status.textContent).toBe(
      "Published 0 enhanced queries to work item 42.",
    );
    expect(link?.textContent).toBe("42");
    expect(link?.href).toBe("https://dev.azure.com/Contoso/Project/_workitems/edit/42");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
  });

  it("shows a publish conflict only in the tile and keeps the connection active", async () => {
    const harness = makeHarness(42);
    vi.mocked(harness.writer.write).mockResolvedValue({ ok: false, error: "HTTP 412" });
    await harness.controller.init();

    harness.elements.publishButton.click();
    await flush();

    expect(harness.errors).toHaveLength(0);
    expect(harness.elements.status.textContent).toContain("HTTP 412");
    expect(harness.elements.status.classList.contains("card__hint--error")).toBe(true);
    expect(harness.elements.pullButton.disabled).toBe(false);
  });
});
