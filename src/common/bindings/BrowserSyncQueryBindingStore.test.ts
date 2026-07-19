import { describe, expect, it, vi } from "vitest";

import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";

import { BrowserSyncQueryBindingStore } from "./BrowserSyncQueryBindingStore";

// Hand-written fake so no real chrome.* is touched in tests.
class FakeBrowserSyncStorage implements IBrowserSyncStorage {
  private data = new Map<string, unknown>();
  private listeners = new Map<string, Array<(value: unknown) => void>>();
  private pendingGets = new Map<string, Array<(value: unknown) => void>>();
  private failGetKeys = new Set<string>();

  async get(key: string): Promise<unknown> {
    if (this.failGetKeys.has(key)) {
      throw new Error(`boom:${key}`);
    }
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
    this.data.set(key, value);
    for (const listener of this.listeners.get(key) ?? []) {
      listener(value);
    }
  }

  failNextGet(key: string): void {
    this.failGetKeys.add(key);
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

  listenerCount(key: string): number {
    return (this.listeners.get(key) ?? []).length;
  }
}

const KEY = "bindings.queries";

describe("BrowserSyncQueryBindingStore", () => {
  describe("read", () => {
    it("returns an empty map when nothing is stored", async () => {
      const store = new BrowserSyncQueryBindingStore(new FakeBrowserSyncStorage());
      expect(await store.read()).toEqual({});
    });

    it("normalizes the stored value", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(KEY, { good: { view: "sprint", properties: {} }, bad: 3 });
      const store = new BrowserSyncQueryBindingStore(fake);
      expect(await store.read()).toEqual({
        good: { view: "sprint", properties: {} },
      });
    });
  });

  describe("bind", () => {
    it("adds a binding without touching existing ones", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(KEY, { existing: { view: "sprint", properties: {} } });
      const store = new BrowserSyncQueryBindingStore(fake);

      await store.bind("new", {
        view: "projectTracking",
        properties: { area: "Web" },
        active: "enhanced",
      });

      expect(await fake.get(KEY)).toEqual({
        existing: { view: "sprint", properties: {} },
        new: { view: "projectTracking", properties: { area: "Web" }, active: "enhanced" },
      });
    });

    it("replaces a binding for the same query id", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncQueryBindingStore(fake);
      await store.bind("q", { view: "sprint", properties: {}, active: "enhanced" });
      await store.bind("q", { view: "projectTracking", properties: {}, active: "standard" });
      expect(await store.read()).toEqual({
        q: { view: "projectTracking", properties: {}, active: "standard" },
      });
    });
  });

  describe("unbind", () => {
    it("removes only the named binding", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(KEY, {
        keep: { view: "sprint", properties: {} },
        drop: { view: "projectTracking", properties: {} },
      });
      const store = new BrowserSyncQueryBindingStore(fake);

      await store.unbind("drop");

      expect(await store.read()).toEqual({
        keep: { view: "sprint", properties: {} },
      });
    });

    it("is a no-op when the query is not bound", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(KEY, { keep: { view: "sprint", properties: {} } });
      const setSpy = vi.spyOn(fake, "set");
      const store = new BrowserSyncQueryBindingStore(fake);

      await store.unbind("absent");

      expect(setSpy).not.toHaveBeenCalled();
    });
  });

  describe("setActiveView", () => {
    it("updates only the active view, preserving the binding's other fields", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(KEY, {
        q: { view: "projectTracking", properties: { area: "Web" }, name: "My query" },
        other: { view: "sprint", properties: {} },
      });
      const store = new BrowserSyncQueryBindingStore(fake);

      await store.setActiveView("q", "standard");

      expect(await store.read()).toEqual({
        q: {
          view: "projectTracking",
          properties: { area: "Web" },
          name: "My query",
          active: "standard",
        },
        other: { view: "sprint", properties: {} },
      });
    });

    it("is a no-op when the query is not bound", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(KEY, { keep: { view: "sprint", properties: {} } });
      const setSpy = vi.spyOn(fake, "set");
      const store = new BrowserSyncQueryBindingStore(fake);

      await store.setActiveView("absent", "enhanced");

      expect(setSpy).not.toHaveBeenCalled();
    });
  });

  describe("observe", () => {
    it("emits the initial snapshot after ready resolves", async () => {
      const fake = new FakeBrowserSyncStorage();
      await fake.set(KEY, { q: { view: "sprint", properties: {} } });
      const store = new BrowserSyncQueryBindingStore(fake);
      const listener = vi.fn();

      const { ready, unsubscribe } = store.observe(listener);
      await ready;

      expect(listener).toHaveBeenCalledWith({
        q: { view: "sprint", properties: {} },
      });
      unsubscribe();
    });

    it("emits normalized snapshots on later changes", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncQueryBindingStore(fake);
      const listener = vi.fn();
      const { ready, unsubscribe } = store.observe(listener);
      await ready;
      listener.mockClear();

      fake.emit(KEY, { q: { view: "sprint", properties: {} } });

      expect(listener).toHaveBeenCalledWith({
        q: { view: "sprint", properties: {} },
      });
      unsubscribe();
    });

    it("does not clobber a live change that lands during the initial read", async () => {
      const fake = new FakeBrowserSyncStorage();
      fake.setDeferred(KEY);
      const store = new BrowserSyncQueryBindingStore(fake);
      const listener = vi.fn();
      const { ready } = store.observe(listener);

      // A change arrives before the initial read resolves.
      fake.emit(KEY, { live: { view: "sprint", properties: {} } });
      fake.resolveDeferred(KEY, {});
      await ready;

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        live: { view: "sprint", properties: {} },
      });
    });

    it("stops emitting and releases the subscription after unsubscribe", async () => {
      const fake = new FakeBrowserSyncStorage();
      const store = new BrowserSyncQueryBindingStore(fake);
      const listener = vi.fn();
      const { ready, unsubscribe } = store.observe(listener);
      await ready;
      listener.mockClear();

      unsubscribe();
      fake.emit(KEY, { q: { view: "sprint", properties: {} } });

      expect(listener).not.toHaveBeenCalled();
      expect(fake.listenerCount(KEY)).toBe(0);
    });

    it("rejects ready and unsubscribes when the initial read fails", async () => {
      const fake = new FakeBrowserSyncStorage();
      fake.failNextGet(KEY);
      const store = new BrowserSyncQueryBindingStore(fake);
      const { ready } = store.observe(vi.fn());

      await expect(ready).rejects.toThrow("boom:bindings.queries");
      expect(fake.listenerCount(KEY)).toBe(0);
    });
  });
});
