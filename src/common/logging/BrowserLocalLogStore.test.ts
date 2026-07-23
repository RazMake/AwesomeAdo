import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IBrowserLocalStorage } from "../browser/IBrowserLocalStorage";

import { BrowserLocalLogStore } from "./BrowserLocalLogStore";
import { type LogEntry, MAX_LOG_ENTRIES } from "./LogEntry";

class FakeLocalStorage implements IBrowserLocalStorage {
  private readonly values = new Map<string, unknown>();
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();
  /** When set, replaces the default `get` so a test can slow or fail the initial read. */
  getImpl: ((key: string) => Promise<unknown>) | null = null;

  get(key: string): Promise<unknown> {
    return this.getImpl ? this.getImpl(key) : Promise.resolve(this.values.get(key));
  }

  set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    this.notify(key, value);
    return Promise.resolve();
  }

  subscribe(key: string, listener: (value: unknown) => void): () => void {
    const set = this.listeners.get(key) ?? new Set();
    set.add(listener);
    this.listeners.set(key, set);
    return () => set.delete(listener);
  }

  /** Simulate an external change (e.g. another context's write) independent of `get`. */
  emitChange(key: string, value: unknown): void {
    this.values.set(key, value);
    this.notify(key, value);
  }

  private notify(key: string, value: unknown): void {
    for (const listener of [...(this.listeners.get(key) ?? [])]) {
      listener(value);
    }
  }
}

const entry = (timestamp: number, message: string): LogEntry => ({
  timestamp,
  level: "info",
  message,
});

describe("BrowserLocalLogStore", () => {
  let storage: FakeLocalStorage;
  let store: BrowserLocalLogStore;

  beforeEach(() => {
    storage = new FakeLocalStorage();
    store = new BrowserLocalLogStore(storage);
  });

  it("appends entries and reads them back in order", async () => {
    await store.append(entry(1, "a"));
    await store.append(entry(2, "b"));

    expect(await store.read()).toEqual([entry(1, "a"), entry(2, "b")]);
  });

  it("serializes concurrent appends so none are lost to a read-modify-write race", async () => {
    await Promise.all([
      store.append(entry(1, "a")),
      store.append(entry(2, "b")),
      store.append(entry(3, "c")),
    ]);

    expect(await store.read()).toEqual([entry(1, "a"), entry(2, "b"), entry(3, "c")]);
  });

  it("keeps a rolling window, dropping the oldest beyond the cap", async () => {
    for (let index = 0; index < MAX_LOG_ENTRIES + 5; index += 1) {
      await store.append(entry(index, `m${index}`));
    }

    const result = await store.read();

    expect(result).toHaveLength(MAX_LOG_ENTRIES);
    expect(result[0]).toEqual(entry(5, "m5"));
    expect(result[result.length - 1]).toEqual(
      entry(MAX_LOG_ENTRIES + 4, `m${MAX_LOG_ENTRIES + 4}`),
    );
  });

  it("normalizes malformed stored values when reading", async () => {
    storage.emitChange("diagnostics.log", [entry(1, "ok"), null, { timestamp: "x" }]);

    expect(await store.read()).toEqual([entry(1, "ok")]);
  });

  it("clears all entries", async () => {
    await store.append(entry(1, "a"));

    await store.clear();

    expect(await store.read()).toEqual([]);
  });

  it("emits the current entries on subscribe and again on every change", async () => {
    await store.append(entry(1, "a"));
    const seen: LogEntry[][] = [];

    const observation = store.observe((entries) => seen.push(entries));
    await observation.ready;
    await store.append(entry(2, "b"));

    expect(seen[0]).toEqual([entry(1, "a")]);
    expect(seen[seen.length - 1]).toEqual([entry(1, "a"), entry(2, "b")]);
    observation.unsubscribe();
  });

  it("skips the initial snapshot when a change wins the race during the read", async () => {
    let resolveRead: (value: unknown) => void = () => undefined;
    storage.getImpl = () => new Promise((resolve) => (resolveRead = resolve));
    const seen: LogEntry[][] = [];

    const observation = store.observe((entries) => seen.push(entries));
    // A live change arrives before the initial read resolves.
    storage.emitChange("diagnostics.log", [entry(9, "live")]);
    resolveRead([]);
    await observation.ready;

    expect(seen).toEqual([[entry(9, "live")]]);
    observation.unsubscribe();
  });

  it("rejects ready and unsubscribes when the initial read fails", async () => {
    storage.getImpl = () => Promise.reject(new Error("read failed"));
    const listener = vi.fn();

    const observation = store.observe(listener);

    await expect(observation.ready).rejects.toThrow("read failed");
    storage.emitChange("diagnostics.log", [entry(1, "after")]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops emitting after unsubscribe", async () => {
    const listener = vi.fn();
    const observation = store.observe(listener);
    await observation.ready;

    observation.unsubscribe();
    await store.append(entry(1, "a"));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
