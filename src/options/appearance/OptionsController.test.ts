import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { IAdoTabReader } from "../../common/browser/IAdoTabReader";
import type { AdoTabContext } from "../../common/navigation/AdoContext";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import { OptionsController, type OptionsElements } from "./OptionsController";

// ─────────────────────────────────────────────────────────────────────────────
// Deferred helper
// ─────────────────────────────────────────────────────────────────────────────

interface DeferredPromise<T> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  promise: Promise<T>;
}

function deferred<T>(): DeferredPromise<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake store
// ─────────────────────────────────────────────────────────────────────────────

type ObserveCallback = (settings: ExtensionSettings) => void;
type ObserveResult = ReturnType<ISettingsStore["observe"]>;

class FakeSettingsStore implements ISettingsStore {
  private callbacks: ObserveCallback[] = [];
  private readyDeferred = deferred<void>();
  private writeDeferred: DeferredPromise<void> | null = null;
  writeCalls: Partial<ExtensionSettings>[] = [];
  unsubscribeCalls = 0;

  observe(callback: ObserveCallback): ObserveResult {
    this.callbacks.push(callback);
    return {
      ready: this.readyDeferred.promise,
      unsubscribe: () => {
        this.unsubscribeCalls++;
      },
    };
  }

  read(): Promise<ExtensionSettings> {
    return Promise.resolve({ ...DEFAULT_SETTINGS, theme: "auto", defaultView: "enhanced" });
  }

  write(settings: Partial<ExtensionSettings>): Promise<void> {
    this.writeCalls.push({ ...settings });
    if (this.writeDeferred) {
      return this.writeDeferred.promise;
    }
    return Promise.resolve();
  }

  resolveReady(): void {
    this.readyDeferred.resolve();
  }

  rejectReady(error: unknown): void {
    this.readyDeferred.reject(error);
  }

  setWriteDeferred(d: DeferredPromise<void>): void {
    this.writeDeferred = d;
  }

  clearWriteDeferred(): void {
    this.writeDeferred = null;
  }

  emit(settings: Partial<ExtensionSettings>): void {
    const full: ExtensionSettings = { ...DEFAULT_SETTINGS, ...settings };
    for (const cb of this.callbacks) {
      cb(full);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake ADO tab reader
// ─────────────────────────────────────────────────────────────────────────────

class FakeAdoTabReader implements IAdoTabReader {
  private result: DeferredPromise<AdoTabContext | null> = deferred();
  readCalls = 0;

  read(): Promise<AdoTabContext | null> {
    this.readCalls++;
    return this.result.promise;
  }

  resolve(context: AdoTabContext | null): void {
    this.result.resolve(context);
  }

  reject(error: unknown): void {
    this.result.reject(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSelect(options: string[]): HTMLSelectElement {
  const select = document.createElement("select");
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  return select;
}

function makeElements(): OptionsElements {
  const root = document.createElement("div");
  const themeSelect = makeSelect(["auto", "light", "dark", "blue"]);
  const defaultViewSelect = makeSelect(["original", "enhanced"]);
  document.body.append(root, themeSelect, defaultViewSelect);
  return { root, themeSelect, defaultViewSelect };
}

async function initReady(
  store: FakeSettingsStore,
  reader: FakeAdoTabReader,
  elements: OptionsElements,
  initial: Partial<ExtensionSettings> = { theme: "auto", defaultView: "enhanced" },
  context: AdoTabContext | null = null,
): Promise<OptionsController> {
  const controller = new OptionsController(store, reader, elements);
  const init = controller.init();
  store.emit(initial);
  store.resolveReady();
  reader.resolve(context);
  await init;
  return controller;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("OptionsController — initialization", () => {
  let store: FakeSettingsStore;
  let reader: FakeAdoTabReader;
  let elements: OptionsElements;

  beforeEach(() => {
    store = new FakeSettingsStore();
    reader = new FakeAdoTabReader();
    elements = makeElements();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("disables both selects at construction", () => {
    new OptionsController(store, reader, elements);
    expect(elements.themeSelect.disabled).toBe(true);
    expect(elements.defaultViewSelect.disabled).toBe(true);
  });

  it("enables both selects after init() resolves", async () => {
    const controller = await initReady(store, reader, elements);
    expect(elements.themeSelect.disabled).toBe(false);
    expect(elements.defaultViewSelect.disabled).toBe(false);
    controller.dispose();
  });

  it("rejects init() and leaves selects disabled when ready rejects", async () => {
    const controller = new OptionsController(store, reader, elements);
    const init = controller.init();
    store.rejectReady(new Error("storage unavailable"));
    await expect(init).rejects.toThrow("storage unavailable");
    expect(elements.themeSelect.disabled).toBe(true);
    expect(elements.defaultViewSelect.disabled).toBe(true);
  });

  it("cleans up the subscription when init() rejects", async () => {
    const controller = new OptionsController(store, reader, elements);
    const init = controller.init();
    store.rejectReady(new Error("fail"));
    await expect(init).rejects.toThrow();
    expect(store.unsubscribeCalls).toBe(1);
  });

  it("syncs both selects from the observation callback", async () => {
    const controller = await initReady(store, reader, elements, {
      theme: "blue",
      defaultView: "original",
    });
    expect(elements.themeSelect.value).toBe("blue");
    expect(elements.defaultViewSelect.value).toBe("original");
    controller.dispose();
  });

  it("applies the resolved theme to the root from the observation callback", async () => {
    const controller = await initReady(store, reader, elements, {
      theme: "light",
      defaultView: "enhanced",
    });
    expect(elements.root.dataset.theme).toBe("light");
    controller.dispose();
  });
});

describe("OptionsController — external observation", () => {
  let store: FakeSettingsStore;
  let reader: FakeAdoTabReader;
  let elements: OptionsElements;
  let controller: OptionsController;

  beforeEach(async () => {
    store = new FakeSettingsStore();
    reader = new FakeAdoTabReader();
    elements = makeElements();
    controller = await initReady(store, reader, elements);
  });

  afterEach(() => {
    controller.dispose();
    document.body.innerHTML = "";
  });

  it("updates the theme select when external settings change", () => {
    store.emit({ theme: "dark", defaultView: "enhanced" });
    expect(elements.themeSelect.value).toBe("dark");
  });

  it("updates the default-view select when external settings change", () => {
    store.emit({ theme: "auto", defaultView: "original" });
    expect(elements.defaultViewSelect.value).toBe("original");
  });

  it("re-applies the resolved theme when external settings change", () => {
    store.emit({ theme: "blue", defaultView: "enhanced" });
    expect(elements.root.dataset.theme).toBe("blue");
  });
});

describe("OptionsController — change handling and write queue", () => {
  let store: FakeSettingsStore;
  let reader: FakeAdoTabReader;
  let elements: OptionsElements;
  let controller: OptionsController;

  beforeEach(async () => {
    store = new FakeSettingsStore();
    reader = new FakeAdoTabReader();
    elements = makeElements();
    controller = await initReady(store, reader, elements, {
      theme: "auto",
      defaultView: "enhanced",
    });
  });

  afterEach(() => {
    controller.dispose();
    document.body.innerHTML = "";
  });

  it("writes { theme } after a theme change event", async () => {
    elements.themeSelect.value = "dark";
    elements.themeSelect.dispatchEvent(new Event("change"));
    await flush();
    expect(store.writeCalls).toContainEqual({ theme: "dark" });
  });

  it("writes { defaultView } after a default-view change event", async () => {
    elements.defaultViewSelect.value = "original";
    elements.defaultViewSelect.dispatchEvent(new Event("change"));
    await flush();
    expect(store.writeCalls).toContainEqual({ defaultView: "original" });
  });

  it("applies the new theme immediately on change, before the store round-trip", () => {
    const writeD = deferred<void>();
    store.setWriteDeferred(writeD);
    elements.themeSelect.value = "light";
    elements.themeSelect.dispatchEvent(new Event("change"));
    // No emit yet — the visual theme must already reflect the user's choice.
    expect(elements.root.dataset.theme).toBe("light");
    writeD.resolve();
    store.clearWriteDeferred();
  });

  it("does not overwrite a select while its write is pending", async () => {
    const writeD = deferred<void>();
    store.setWriteDeferred(writeD);
    elements.themeSelect.value = "blue";
    elements.themeSelect.dispatchEvent(new Event("change"));
    store.emit({ theme: "dark", defaultView: "enhanced" });
    expect(elements.themeSelect.value).toBe("blue");
    writeD.resolve();
    store.clearWriteDeferred();
    await writeD.promise;
  });

  it("restores the last confirmed value when a write is rejected", async () => {
    const writeD = deferred<void>();
    store.setWriteDeferred(writeD);
    elements.defaultViewSelect.value = "original";
    elements.defaultViewSelect.dispatchEvent(new Event("change"));
    await Promise.resolve();
    writeD.reject(new Error("write failed"));
    store.clearWriteDeferred();
    await flush();
    // confirmed value from init was "enhanced".
    expect(elements.defaultViewSelect.value).toBe("enhanced");
  });

  it("calls reportError once on a write failure", async () => {
    const errors: unknown[] = [];
    const freshStore = new FakeSettingsStore();
    const freshReader = new FakeAdoTabReader();
    const freshElements = makeElements();
    const freshController = new OptionsController(freshStore, freshReader, freshElements, (e) =>
      errors.push(e),
    );
    const init = freshController.init();
    freshStore.emit({ theme: "auto", defaultView: "enhanced" });
    freshStore.resolveReady();
    freshReader.resolve(null);
    await init;

    const writeD = deferred<void>();
    freshStore.setWriteDeferred(writeD);
    freshElements.themeSelect.value = "dark";
    freshElements.themeSelect.dispatchEvent(new Event("change"));
    await Promise.resolve();
    writeD.reject(new Error("boom"));
    freshStore.clearWriteDeferred();
    await flush();

    expect(errors.length).toBe(1);
    freshController.dispose();
  });
});

describe("OptionsController — ADO theme resolution", () => {
  let store: FakeSettingsStore;
  let reader: FakeAdoTabReader;
  let elements: OptionsElements;

  beforeEach(() => {
    store = new FakeSettingsStore();
    reader = new FakeAdoTabReader();
    elements = makeElements();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves the auto theme from the ADO tab's rendered theme", async () => {
    const controller = await initReady(
      store,
      reader,
      elements,
      { theme: "auto", defaultView: "enhanced" },
      { organization: "contoso", project: "web", theme: "light" },
    );
    expect(elements.root.dataset.theme).toBe("light");
    controller.dispose();
  });

  it("reports and survives a reader failure without breaking the settings UI", async () => {
    const errors: unknown[] = [];
    const controller = new OptionsController(store, reader, elements, (e) => errors.push(e));
    const init = controller.init();
    store.emit({ theme: "auto", defaultView: "enhanced" });
    store.resolveReady();
    reader.reject(new Error("no tabs permission"));
    await init;
    expect(errors.length).toBe(1);
    expect(elements.themeSelect.disabled).toBe(false);
    controller.dispose();
  });
});

describe("OptionsController — disposal", () => {
  let store: FakeSettingsStore;
  let reader: FakeAdoTabReader;
  let elements: OptionsElements;

  beforeEach(() => {
    store = new FakeSettingsStore();
    reader = new FakeAdoTabReader();
    elements = makeElements();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("disables both selects", async () => {
    const controller = await initReady(store, reader, elements);
    controller.dispose();
    expect(elements.themeSelect.disabled).toBe(true);
    expect(elements.defaultViewSelect.disabled).toBe(true);
  });

  it("unsubscribes from the store", async () => {
    const controller = await initReady(store, reader, elements);
    controller.dispose();
    expect(store.unsubscribeCalls).toBe(1);
  });

  it("dispose() before ready resolves cancels the subscription", () => {
    const controller = new OptionsController(store, reader, elements);
    void controller.init();
    controller.dispose();
    expect(elements.themeSelect.disabled).toBe(true);
    store.resolveReady();
    expect(elements.themeSelect.disabled).toBe(true);
  });

  it("dispose() is idempotent", async () => {
    const controller = await initReady(store, reader, elements);
    controller.dispose();
    expect(() => controller.dispose()).not.toThrow();
  });

  it("dispose() during a queued write causes no select mutation after it settles", async () => {
    const controller = await initReady(store, reader, elements, {
      theme: "auto",
      defaultView: "enhanced",
    });
    const writeD = deferred<void>();
    store.setWriteDeferred(writeD);
    elements.themeSelect.value = "dark";
    elements.themeSelect.dispatchEvent(new Event("change"));
    // Let the queued write start and attach its handler to the pending promise before it rejects.
    await Promise.resolve();
    controller.dispose();
    writeD.reject(new Error("late"));
    store.clearWriteDeferred();
    await flush();
    // The rejected write must not roll the value back after disposal.
    expect(elements.themeSelect.value).toBe("dark");
  });
});
