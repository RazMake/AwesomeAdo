import { describe, expect, it, vi } from "vitest";

import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";

import { BrowserSyncSettingsStore } from "./BrowserSyncSettingsStore";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "./ExtensionSettings";

// Hand-written fake so no real chrome.* is touched in tests.
class FakeBrowserSyncStorage implements IBrowserSyncStorage {
  private data = new Map<string, unknown>();
  private listeners = new Map<string, Array<(value: unknown) => void>>();

  // Deferred get for race-condition tests
  private pendingGets = new Map<string, Array<(value: unknown) => void>>();

  async get(key: string): Promise<unknown> {
    if (this.pendingGets.has(key)) {
      return new Promise((resolve) => {
        this.pendingGets.get(key)!.push(resolve);
      });
    }
    return this.data.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  subscribe(key: string, listener: (value: unknown) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(listener);
    return () => {
      const arr = this.listeners.get(key) ?? [];
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  emit(key: string, value: unknown): void {
    for (const listener of this.listeners.get(key) ?? []) {
      listener(value);
    }
  }

  setDeferred(key: string): void {
    this.pendingGets.set(key, []);
  }

  resolveDeferred(key: string, value: unknown): void {
    const pending = this.pendingGets.get(key) ?? [];
    this.pendingGets.delete(key);
    for (const resolve of pending) {
      resolve(value);
    }
  }

  getListenerCount(key: string): number {
    return (this.listeners.get(key) ?? []).length;
  }

  getStoredKeys(): string[] {
    return [...this.data.keys()];
  }
}

const THEME_KEY = "settings.theme";
const DEFAULT_VIEW_KEY = "settings.defaultView";
const CURRENT_TEAM_KEY = "settings.currentTeam";
const FUTURE_SPRINTS_KEY = "settings.futureSprintsCount";
const AREA_PATHS_KEY = "settings.areaPaths";
const BOARD_COLUMNS_KEY = "settings.boardColumns";
const WORK_ITEM_TYPES_KEY = "settings.workItemTypes";

describe("BrowserSyncSettingsStore", () => {
  describe("read", () => {
    it("normalizes missing values to the defaults", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("normalizes invalid values to the defaults", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(THEME_KEY, "rainbow");
      await fake.set(DEFAULT_VIEW_KEY, 42);
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("preserves valid stored values", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(THEME_KEY, "dark");
      await fake.set(DEFAULT_VIEW_KEY, "original");
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark", defaultView: "original" });
    });

    it("reads the team, future-sprints, and area-path keys", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(CURRENT_TEAM_KEY, { id: "team-1", name: "Platform" });
      await fake.set(FUTURE_SPRINTS_KEY, 5);
      await fake.set(AREA_PATHS_KEY, [{ path: "Web\\Api", label: "Api" }]);
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings.currentTeam).toEqual({ id: "team-1", name: "Platform" });
      expect(settings.futureSprintsCount).toBe(5);
      expect(settings.areaPaths).toEqual([{ path: "Web\\Api", label: "Api" }]);
    });

    it("reads and normalizes the board-columns key", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(BOARD_COLUMNS_KEY, [" Queue ", "queue", "Done"]);
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      // Normalization trims and dedupes the stored list case-insensitively.
      expect(settings.boardColumns).toEqual(["Queue", "Done"]);
    });

    it("reads and normalizes the work-item-types key", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(WORK_ITEM_TYPES_KEY, [
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/icon_insect",
          columns: [{ column: "Active", states: ["New", "Active"] }],
        },
      ]);
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings.workItemTypes).toEqual([
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/icon_insect",
          columns: [{ column: "Active", states: ["New", "Active"] }],
        },
      ]);
    });

    it("does not write any key during a read", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.read();
      expect(fake.getStoredKeys()).toEqual([]);
    });
  });

  describe("write", () => {
    it("persists a supplied theme value", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({ theme: "blue" });
      expect(await fake.get(THEME_KEY)).toBe("blue");
    });

    it("persists a supplied defaultView value", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({ defaultView: "original" });
      expect(await fake.get(DEFAULT_VIEW_KEY)).toBe("original");
    });

    it("does not write when the update object is empty", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({});
      expect(fake.getStoredKeys()).toEqual([]);
    });

    it("only touches the keys present in the update", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({ theme: "light" });
      expect(fake.getStoredKeys()).toEqual([THEME_KEY]);
    });

    it("writes both keys when both are supplied", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({ theme: "dark", defaultView: "enhanced" });
      expect(await fake.get(THEME_KEY)).toBe("dark");
      expect(await fake.get(DEFAULT_VIEW_KEY)).toBe("enhanced");
    });

    it("persists a null currentTeam so a cleared selection is stored, not skipped", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({ currentTeam: null });
      expect(fake.getStoredKeys()).toEqual([CURRENT_TEAM_KEY]);
      expect(await fake.get(CURRENT_TEAM_KEY)).toBeNull();
    });

    it("persists the future-sprints and area-path keys", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({
        futureSprintsCount: 6,
        areaPaths: [{ path: "Web\\Api", label: "Api" }],
      });
      expect(await fake.get(FUTURE_SPRINTS_KEY)).toBe(6);
      expect(await fake.get(AREA_PATHS_KEY)).toEqual([{ path: "Web\\Api", label: "Api" }]);
    });

    it("persists the board-columns key when supplied", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      await store.write({ boardColumns: ["Queue", "Active", "Done"] });
      expect(fake.getStoredKeys()).toEqual([BOARD_COLUMNS_KEY]);
      expect(await fake.get(BOARD_COLUMNS_KEY)).toEqual(["Queue", "Active", "Done"]);
    });

    it("persists the work-item-types key when supplied", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      const workItemTypes = [
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/icon_insect",
          columns: [{ column: "Active" as const, states: ["Active"] }],
        },
      ];
      await store.write({ workItemTypes });
      expect(fake.getStoredKeys()).toEqual([WORK_ITEM_TYPES_KEY]);
      expect(await fake.get(WORK_ITEM_TYPES_KEY)).toEqual(workItemTypes);
    });
  });

  describe("logging", () => {
    const makeLogger = () => ({ info: vi.fn(), error: vi.fn() });

    it("names the changed settings without recording their values", async () => {
      const fake = new FakeBrowserSyncStorage();
      const logger = makeLogger();
      const store = new BrowserSyncSettingsStore(fake, logger);

      await store.write({ theme: "dark", currentTeam: { id: "t1", name: "Platform" } });

      // Only the setting names appear — never the team name/id, which could reveal the user's org.
      expect(logger.info).toHaveBeenCalledWith("Settings saved: theme, currentTeam");
      expect(vi.mocked(logger.info).mock.calls[0]?.[0]).not.toContain("Platform");
    });

    it("does not log when nothing changed", async () => {
      const fake = new FakeBrowserSyncStorage();
      const logger = makeLogger();
      const store = new BrowserSyncSettingsStore(fake, logger);

      await store.write({});

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("observe", () => {
    it("subscribes to every key before reading", async () => {
      const fake = new FakeBrowserSyncStorage();
      fake.setDeferred(THEME_KEY);
      fake.setDeferred(DEFAULT_VIEW_KEY);
      const store = new BrowserSyncSettingsStore(fake);
      const snapshots: string[] = [];
      const { ready } = store.observe((s) => snapshots.push(s.theme));
      // Both subscriptions must exist synchronously before the async gets resolve.
      expect(fake.getListenerCount(THEME_KEY)).toBe(1);
      expect(fake.getListenerCount(DEFAULT_VIEW_KEY)).toBe(1);
      fake.resolveDeferred(THEME_KEY, "dark");
      fake.resolveDeferred(DEFAULT_VIEW_KEY, "original");
      await ready;
      expect(snapshots).toEqual(["dark"]);
    });

    it("emits the normalized initial snapshot from storage", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(THEME_KEY, "blue");
      await fake.set(DEFAULT_VIEW_KEY, "original");
      const store = new BrowserSyncSettingsStore(fake);
      const snapshots: ExtensionSettings[] = [];
      const { ready } = store.observe((s) => snapshots.push(s));
      await ready;
      expect(snapshots).toEqual([{ ...DEFAULT_SETTINGS, theme: "blue", defaultView: "original" }]);
    });

    it("delivers subsequent values when any key changes", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      const themes: string[] = [];
      const { ready } = store.observe((s) => themes.push(s.theme));
      await ready;
      fake.emit(THEME_KEY, "light");
      expect(themes).toContain("light");
    });

    it("unsubscribes from every key and stops emitting", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      const snapshots: ExtensionSettings[] = [];
      const { ready, unsubscribe } = store.observe((s) => snapshots.push(s));
      await ready;
      unsubscribe();
      const countBefore = snapshots.length;
      fake.emit(THEME_KEY, "dark");
      expect(snapshots.length).toBe(countBefore);
      expect(fake.getListenerCount(THEME_KEY)).toBe(0);
      expect(fake.getListenerCount(DEFAULT_VIEW_KEY)).toBe(0);
    });

    it("a newer storage event suppresses the stale initial snapshot", async () => {
      const fake = new FakeBrowserSyncStorage();
      fake.setDeferred(THEME_KEY);
      const store = new BrowserSyncSettingsStore(fake);
      const themes: string[] = [];
      const { ready } = store.observe((s) => themes.push(s.theme));

      // Fire a change BEFORE the initial get resolves → increments revision.
      fake.emit(THEME_KEY, "dark");
      // Now resolve the deferred get with a different value.
      fake.resolveDeferred(THEME_KEY, "light");
      await ready;

      // The event (dark) wins; the stale get snapshot (light) is suppressed.
      expect(themes).toEqual(["dark"]);
    });

    it("cleans up every subscription when the initial read fails", async () => {
      const fake = new FakeBrowserSyncStorage();
      fake.get = () => Promise.reject(new Error("storage error"));
      const store = new BrowserSyncSettingsStore(fake);
      const { ready } = store.observe(() => {});
      await expect(ready).rejects.toThrow("storage error");
      expect(fake.getListenerCount(THEME_KEY)).toBe(0);
      expect(fake.getListenerCount(DEFAULT_VIEW_KEY)).toBe(0);
    });
  });
});
