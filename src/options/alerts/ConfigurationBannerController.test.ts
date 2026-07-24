import { afterEach, describe, expect, it } from "vitest";

import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../../common/bindings/QueryBinding";
import type { StorageObservation } from "../../common/browser/observeSyncKeys";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import { ConfigurationBannerController } from "./ConfigurationBannerController";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONFIGURED: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  currentTeam: { id: "t1", name: "Platform" },
  areaPaths: [{ path: "A\\B", label: "B" }],
  boardColumns: ["Active"],
  workItemTypes: [
    { name: "Bug", color: "", icon: "", columns: [{ column: "Active", states: ["New"] }] },
  ],
};

const BINDING: QueryBinding = { view: "sprint", properties: {} };

class FakeSettingsStore implements ISettingsStore {
  private listener: ((settings: ExtensionSettings) => void) | null = null;
  unsubscribed = false;
  ready: Promise<void> = Promise.resolve();

  observe(listener: (settings: ExtensionSettings) => void): StorageObservation {
    this.listener = listener;
    return {
      ready: this.ready,
      unsubscribe: () => {
        this.unsubscribed = true;
      },
    };
  }

  emit(settings: ExtensionSettings): void {
    this.listener?.(settings);
  }

  read(): Promise<ExtensionSettings> {
    return Promise.resolve({ ...DEFAULT_SETTINGS });
  }

  write(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeQueryBindingStore implements IQueryBindingStore {
  private listener: ((bindings: QueryBindings) => void) | null = null;
  unsubscribed = false;
  ready: Promise<void> = Promise.resolve();

  observe(listener: (bindings: QueryBindings) => void): StorageObservation {
    this.listener = listener;
    return {
      ready: this.ready,
      unsubscribe: () => {
        this.unsubscribed = true;
      },
    };
  }

  emit(bindings: QueryBindings): void {
    this.listener?.(bindings);
  }

  read(): Promise<QueryBindings> {
    return Promise.resolve({});
  }

  bind(): Promise<void> {
    return Promise.resolve();
  }

  unbind(): Promise<void> {
    return Promise.resolve();
  }

  setActiveView(): Promise<void> {
    return Promise.resolve();
  }
}

function setup(): {
  settingsStore: FakeSettingsStore;
  bindingStore: FakeQueryBindingStore;
  banner: HTMLElement;
  errors: unknown[];
  controller: ConfigurationBannerController;
} {
  const settingsStore = new FakeSettingsStore();
  const bindingStore = new FakeQueryBindingStore();
  const banner = document.createElement("div");
  document.body.append(banner);
  const errors: unknown[] = [];
  const controller = new ConfigurationBannerController(
    settingsStore,
    bindingStore,
    banner,
    (error) => errors.push(error),
  );
  return { settingsStore, bindingStore, banner, errors, controller };
}

afterEach(() => {
  document.body.innerHTML = "";
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("ConfigurationBannerController", () => {
  it("starts hidden before any snapshot arrives", async () => {
    const { banner, controller } = setup();
    await controller.init();
    expect(banner.hidden).toBe(true);
  });

  it("stays hidden when there are no bindings, even with incomplete settings", async () => {
    const { settingsStore, bindingStore, banner, controller } = setup();
    await controller.init();

    settingsStore.emit(DEFAULT_SETTINGS);
    bindingStore.emit({});

    expect(banner.hidden).toBe(true);
  });

  it("shows when a binding exists and the settings are incomplete", async () => {
    const { settingsStore, bindingStore, banner, controller } = setup();
    await controller.init();

    settingsStore.emit(DEFAULT_SETTINGS);
    bindingStore.emit({ q1: BINDING });

    expect(banner.hidden).toBe(false);
  });

  it("stays hidden when a binding exists but the settings are complete", async () => {
    const { settingsStore, bindingStore, banner, controller } = setup();
    await controller.init();

    settingsStore.emit(CONFIGURED);
    bindingStore.emit({ q1: BINDING });

    expect(banner.hidden).toBe(true);
  });

  it("hides again once the settings become complete", async () => {
    const { settingsStore, bindingStore, banner, controller } = setup();
    await controller.init();
    settingsStore.emit(DEFAULT_SETTINGS);
    bindingStore.emit({ q1: BINDING });
    expect(banner.hidden).toBe(false);

    settingsStore.emit(CONFIGURED);

    expect(banner.hidden).toBe(true);
  });

  it("shows again when the last binding is removed then re-added while incomplete", async () => {
    const { settingsStore, bindingStore, banner, controller } = setup();
    await controller.init();
    settingsStore.emit(DEFAULT_SETTINGS);
    bindingStore.emit({ q1: BINDING });
    expect(banner.hidden).toBe(false);

    bindingStore.emit({});
    expect(banner.hidden).toBe(true);

    bindingStore.emit({ q1: BINDING });
    expect(banner.hidden).toBe(false);
  });

  it("unsubscribes from both stores on dispose", async () => {
    const { settingsStore, bindingStore, controller } = setup();
    await controller.init();

    controller.dispose();

    expect(settingsStore.unsubscribed).toBe(true);
    expect(bindingStore.unsubscribed).toBe(true);
  });

  it("stops updating after dispose", async () => {
    const { settingsStore, bindingStore, banner, controller } = setup();
    await controller.init();
    controller.dispose();

    settingsStore.emit(DEFAULT_SETTINGS);
    bindingStore.emit({ q1: BINDING });

    expect(banner.hidden).toBe(true);
  });

  it("reports an error when an initial read rejects", async () => {
    const settingsStore = new FakeSettingsStore();
    const bindingStore = new FakeQueryBindingStore();
    settingsStore.ready = Promise.reject(new Error("read failed"));
    const banner = document.createElement("div");
    document.body.append(banner);
    const errors: unknown[] = [];
    const controller = new ConfigurationBannerController(
      settingsStore,
      bindingStore,
      banner,
      (error) => errors.push(error),
    );

    await controller.init();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("read failed");
  });
});
