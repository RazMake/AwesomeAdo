import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBindings } from "../../common/bindings/QueryBinding";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";
import { exportConfig } from "../../common/settings-transfer/AwesomeAdoConfig";

import {
  SettingsTransferController,
  type SettingsTransferElements,
} from "./SettingsTransferController";

class FakeSettingsStore implements ISettingsStore {
  written: Partial<ExtensionSettings> | null = null;
  constructor(private current: ExtensionSettings) {}
  read = vi.fn(async () => this.current);
  write = vi.fn(async (update: Partial<ExtensionSettings>) => {
    this.written = update;
  });
  observe = vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() }));
}

class FakeBindingStore implements IQueryBindingStore {
  replaced: QueryBindings | null = null;
  constructor(private current: QueryBindings) {}
  read = vi.fn(async () => this.current);
  bind = vi.fn(async () => {});
  unbind = vi.fn(async () => {});
  replaceAll = vi.fn(async (bindings: QueryBindings) => {
    this.replaced = bindings;
  });
  observe = vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() }));
}

function makeElements(): SettingsTransferElements {
  return {
    exportButton: document.createElement("button"),
    importButton: document.createElement("button"),
    fileInput: document.createElement("input"),
    status: document.createElement("p"),
  };
}

function chooseFile(fileInput: HTMLInputElement, contents: string): void {
  const file = new File([contents], "AwesomeADO.config", { type: "application/json" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fileInput.dispatchEvent(new Event("change"));
}

const sampleBindings: QueryBindings = {
  "11111111-1111-1111-1111-111111111111": { view: "sprint", properties: {}, name: "Q" },
};

const sampleSettings: ExtensionSettings = { ...DEFAULT_SETTINGS, theme: "dark" };

interface Harness {
  controller: SettingsTransferController;
  settingsStore: FakeSettingsStore;
  bindingStore: FakeBindingStore;
  elements: SettingsTransferElements;
  downloaded: { name: string; blobs: Blob[] };
  errors: unknown[];
  /** How many times the controller told the page its stored configuration was replaced. */
  imported: () => number;
}

function setup(overrides?: { settings?: ExtensionSettings; bindings?: QueryBindings }): Harness {
  const settingsStore = new FakeSettingsStore(overrides?.settings ?? sampleSettings);
  const bindingStore = new FakeBindingStore(overrides?.bindings ?? sampleBindings);
  const elements = makeElements();
  const errors: unknown[] = [];
  const downloaded = { name: "", blobs: [] as Blob[] };

  // Spied, not assigned: `restoreMocks` undoes a spy between tests, but a direct assignment to a
  // global stays clobbered for the rest of the file and silently leaks into the next test.
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
    downloaded.blobs.push(blob as Blob);
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.name = this.download;
  });

  let imported = 0;
  const controller = new SettingsTransferController(
    settingsStore,
    bindingStore,
    elements,
    (error) => errors.push(error),
    () => {
      imported += 1;
    },
  );
  controller.init();
  return {
    controller,
    settingsStore,
    bindingStore,
    elements,
    downloaded,
    errors,
    imported: () => imported,
  };
}

// Let queued microtasks (the async export/import handlers) settle before asserting.
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsTransferController export", () => {
  it("downloads a config file built from both stores", async () => {
    const h = setup();

    h.elements.exportButton.dispatchEvent(new Event("click"));
    await flush();

    expect(h.downloaded.blobs).toHaveLength(1);
    expect(h.downloaded.name).toBe("AwesomeADO.config");
    const parsed = JSON.parse(await h.downloaded.blobs[0]!.text()) as {
      settings: ExtensionSettings;
      enhancedQueries: QueryBindings;
    };
    expect(parsed.settings.theme).toBe("dark");
    expect(parsed.enhancedQueries).toEqual(sampleBindings);
    expect(h.elements.status.textContent).toContain("Exported");
  });

  it("reports and shows an error when a store read fails", async () => {
    const h = setup();
    h.settingsStore.read.mockRejectedValueOnce(new Error("storage offline"));

    h.elements.exportButton.dispatchEvent(new Event("click"));
    await flush();

    expect(h.downloaded.blobs).toHaveLength(0);
    expect(h.errors).toHaveLength(1);
    expect(h.elements.status.textContent).toContain("storage offline");
  });
});

describe("SettingsTransferController import", () => {
  it("opens the hidden file input when Import is clicked", () => {
    const h = setup();
    const click = vi.spyOn(h.elements.fileInput, "click");

    h.elements.importButton.dispatchEvent(new Event("click"));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("writes settings and replaces bindings from the selected file", async () => {
    const h = setup();
    const text = exportConfig(
      { ...DEFAULT_SETTINGS, theme: "blue" },
      { q: { view: "sprint", properties: {} } },
    );

    chooseFile(h.elements.fileInput, text);
    await flush();

    expect(h.settingsStore.write).toHaveBeenCalledTimes(1);
    expect(h.settingsStore.written?.theme).toBe("blue");
    expect(h.bindingStore.replaceAll).toHaveBeenCalledTimes(1);
    expect(h.bindingStore.replaced).toEqual({ q: { view: "sprint", properties: {} } });
    expect(h.elements.status.textContent).toContain("Imported");
    expect(h.elements.status.classList.contains("card__hint--error")).toBe(false);
    // The page is told to re-read, so the sections that load once still show the imported values.
    expect(h.imported()).toBe(1);
    // Input is reset so re-selecting the same file re-fires change.
    expect(h.elements.fileInput.value).toBe("");
  });

  it("imports what it can and reports in red what the file got wrong", async () => {
    const h = setup();

    chooseFile(
      h.elements.fileInput,
      JSON.stringify({
        awesomeAdoConfigVersion: 1,
        settings: { theme: "chartreuse", defaultView: "enhanced" },
        enhancedQueries: { good: { view: "sprint", properties: {} }, bad: {} },
      }),
    );
    await flush();

    // The usable half still lands in both stores.
    expect(h.settingsStore.written).toEqual({ defaultView: "enhanced" });
    expect(h.bindingStore.replaced).toEqual({ good: { view: "sprint", properties: {} } });
    // ...and the skipped half is logged and shown as a failure, not as a clean load.
    expect(h.errors).toHaveLength(1);
    expect((h.errors[0] as Error).message).toContain('"theme" was skipped');
    expect(h.elements.status.textContent).toContain("skipped 2 problems");
    expect(h.elements.status.classList.contains("card__hint--error")).toBe(true);
    // A partly-applied file still replaced part of the configuration, so the page must re-read.
    expect(h.imported()).toBe(1);
  });

  it("does nothing when the picker is dismissed without a file", async () => {
    const h = setup();

    h.elements.fileInput.dispatchEvent(new Event("change"));
    await flush();

    expect(h.settingsStore.write).not.toHaveBeenCalled();
    expect(h.bindingStore.replaceAll).not.toHaveBeenCalled();
  });

  it("reports and shows an error for an invalid file without touching the stores", async () => {
    const h = setup();

    chooseFile(h.elements.fileInput, "not a config");
    await flush();

    expect(h.settingsStore.write).not.toHaveBeenCalled();
    expect(h.bindingStore.replaceAll).not.toHaveBeenCalled();
    expect(h.errors).toHaveLength(1);
    expect(h.elements.status.textContent).toContain("Could not import");
    expect(h.elements.status.classList.contains("card__hint--error")).toBe(true);
    // Nothing was replaced, so the page has nothing to re-read.
    expect(h.imported()).toBe(0);
  });

  it("clears the error styling once a later transfer succeeds", async () => {
    const h = setup();

    chooseFile(h.elements.fileInput, "not a config");
    await flush();
    h.elements.exportButton.dispatchEvent(new Event("click"));
    await flush();

    expect(h.elements.status.textContent).toContain("Exported");
    expect(h.elements.status.classList.contains("card__hint--error")).toBe(false);
  });
});

describe("SettingsTransferController lifecycle", () => {
  it("stops responding after dispose", async () => {
    const h = setup();
    h.controller.dispose();

    h.elements.exportButton.dispatchEvent(new Event("click"));
    await flush();

    expect(h.downloaded.blobs).toHaveLength(0);
  });

  it("suppresses the status update if disposed mid-flight", async () => {
    const h = setup();

    chooseFile(h.elements.fileInput, exportConfig(DEFAULT_SETTINGS, {}));
    h.controller.dispose();
    await flush();

    // Write may have started, but the status must not be set after dispose.
    expect(h.elements.status.textContent).toBe("");
  });
});
