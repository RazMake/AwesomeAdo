import { describe, expect, it, vi } from "vitest";

import type { IBrowserSyncStorage } from "./IBrowserSyncStorage";
import { observeSyncKeys } from "./observeSyncKeys";

// Minimal fake so no real chrome.* is touched. Supports deferring a get to simulate a change that
// lands mid-read, and failing a get to exercise the ready-rejection path.
class FakeStorage implements IBrowserSyncStorage {
  private data = new Map<string, unknown>();
  private listeners = new Map<string, Array<(value: unknown) => void>>();
  private deferred = new Map<string, Array<(value: unknown) => void>>();
  private failKeys = new Set<string>();

  async get(key: string): Promise<unknown> {
    if (this.failKeys.has(key)) {
      throw new Error(`boom:${key}`);
    }
    if (this.deferred.has(key)) {
      return new Promise((resolve) => this.deferred.get(key)!.push(resolve));
    }
    return this.data.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  subscribe(key: string, listener: (value: unknown) => void): () => void {
    const arr = this.listeners.get(key) ?? [];
    arr.push(listener);
    this.listeners.set(key, arr);
    return () => {
      const current = this.listeners.get(key) ?? [];
      const index = current.indexOf(listener);
      if (index >= 0) current.splice(index, 1);
    };
  }

  emit(key: string, value: unknown): void {
    this.data.set(key, value);
    for (const listener of this.listeners.get(key) ?? []) {
      listener(value);
    }
  }

  defer(key: string): void {
    this.deferred.set(key, []);
  }

  resolveDeferred(key: string, value: unknown): void {
    const pending = this.deferred.get(key) ?? [];
    this.deferred.delete(key);
    for (const resolve of pending) resolve(value);
  }

  failNextGet(key: string): void {
    this.failKeys.add(key);
  }

  listenerCount(key: string): number {
    return (this.listeners.get(key) ?? []).length;
  }
}

const project = (raw: Record<string, unknown>): string =>
  `${String(raw.a ?? "?")}/${String(raw.b ?? "?")}`;

describe("observeSyncKeys", () => {
  it("projects every key into the initial snapshot", async () => {
    const storage = new FakeStorage();
    await storage.set("a", "1");
    await storage.set("b", "2");
    const listener = vi.fn();

    const { ready, unsubscribe } = observeSyncKeys(storage, ["a", "b"], project, listener);
    await ready;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("1/2");
    unsubscribe();
  });

  it("emits a complete snapshot when a single key later changes", async () => {
    const storage = new FakeStorage();
    await storage.set("a", "1");
    await storage.set("b", "2");
    const listener = vi.fn();
    const { ready, unsubscribe } = observeSyncKeys(storage, ["a", "b"], project, listener);
    await ready;
    listener.mockClear();

    storage.emit("b", "9");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("1/9");
    unsubscribe();
  });

  it("lets a change during the initial read win and skips the stale initial emit", async () => {
    const storage = new FakeStorage();
    storage.defer("a");
    const listener = vi.fn();
    const { ready, unsubscribe } = observeSyncKeys(storage, ["a"], project, listener);

    // The change lands before the initial read resolves, so the initial read must not clobber it.
    storage.emit("a", "live");
    storage.resolveDeferred("a", "stale");
    await ready;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("live/?");
    unsubscribe();
  });

  it("stops emitting and releases subscriptions after unsubscribe", async () => {
    const storage = new FakeStorage();
    const listener = vi.fn();
    const { ready, unsubscribe } = observeSyncKeys(storage, ["a"], project, listener);
    await ready;
    listener.mockClear();

    unsubscribe();
    storage.emit("a", "x");

    expect(listener).not.toHaveBeenCalled();
    expect(storage.listenerCount("a")).toBe(0);
  });

  it("does not emit the initial snapshot when unsubscribed before the read resolves", async () => {
    const storage = new FakeStorage();
    storage.defer("a");
    const listener = vi.fn();
    const { ready, unsubscribe } = observeSyncKeys(storage, ["a"], project, listener);

    unsubscribe();
    storage.resolveDeferred("a", "1");
    await ready;

    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects ready and releases subscriptions when the initial read fails", async () => {
    const storage = new FakeStorage();
    storage.failNextGet("a");
    const { ready } = observeSyncKeys(storage, ["a"], project, vi.fn());

    await expect(ready).rejects.toThrow("boom:a");
    expect(storage.listenerCount("a")).toBe(0);
  });
});
