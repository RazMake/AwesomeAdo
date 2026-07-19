import { describe, expect, it } from "vitest";

import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";

import { BrowserSyncSettingsStore } from "./BrowserSyncSettingsStore";
import type { ExtensionSettings } from "./ExtensionSettings";

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

describe("BrowserSyncSettingsStore", () => {
  describe("read", () => {
    it("normalizes missing values to the defaults", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings).toEqual({ theme: "auto", defaultView: "enhanced" });
    });

    it("normalizes invalid values to the defaults", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(THEME_KEY, "rainbow");
      await fake.set(DEFAULT_VIEW_KEY, 42);
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings).toEqual({ theme: "auto", defaultView: "enhanced" });
    });

    it("preserves valid stored values", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(THEME_KEY, "dark");
      await fake.set(DEFAULT_VIEW_KEY, "original");
      const store = new BrowserSyncSettingsStore(fake);
      const settings = await store.read();
      expect(settings).toEqual({ theme: "dark", defaultView: "original" });
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
      expect(snapshots).toEqual([{ theme: "blue", defaultView: "original" }]);
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
