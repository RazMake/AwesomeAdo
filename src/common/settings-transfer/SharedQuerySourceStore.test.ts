import { describe, expect, it, vi } from "vitest";

import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import type { ILogger } from "../logging/ILogger";

import {
  BrowserSyncSharedQuerySourceStore,
  normalizeSharedQuerySources,
} from "./SharedQuerySourceStore";

const KEY = "sharedQueries.workItemIds";

class FakeStorage implements IBrowserSyncStorage {
  value: unknown;
  readonly set = vi.fn(async (_key: string, value: unknown): Promise<void> => {
    this.value = value;
  });

  async get(): Promise<unknown> {
    return this.value;
  }

  subscribe(): () => void {
    return () => {};
  }
}

const logger = (): ILogger => ({ info: vi.fn(), error: vi.fn() });

describe("normalizeSharedQuerySources", () => {
  it("keeps only entries that name a positive work item id", () => {
    expect(normalizeSharedQuerySources({ a: 12, b: "12", c: 0, d: -3, e: 1.5, f: null })).toEqual({
      a: 12,
    });
  });

  it("answers with an empty map for a value storage never held", () => {
    expect(normalizeSharedQuerySources(undefined)).toEqual({});
    expect(normalizeSharedQuerySources(null)).toEqual({});
    expect(normalizeSharedQuerySources("nope")).toEqual({});
  });

  it("keeps a query literally named __proto__ instead of silently dropping it", () => {
    const sources = normalizeSharedQuerySources(JSON.parse('{"__proto__": 7, "good": 8}'));

    expect(Object.keys(sources).sort()).toEqual(["__proto__", "good"]);
    expect(Object.getPrototypeOf(sources)).toBeNull();
  });
});

describe("BrowserSyncSharedQuerySourceStore", () => {
  it("links a query and logs the transition", async () => {
    const storage = new FakeStorage();
    const log = logger();
    const store = new BrowserSyncSharedQuerySourceStore(storage, log);

    await store.link("q1", 42);

    expect(storage.set).toHaveBeenCalledWith(KEY, { q1: 42 });
    expect(log.info).toHaveBeenCalledWith("Query q1 now reads its configuration from work item 42");
  });

  it("leaves the other queries alone when linking another one", async () => {
    const storage = new FakeStorage();
    storage.value = { q1: 42 };
    const store = new BrowserSyncSharedQuerySourceStore(storage);

    await store.link("q2", 7);

    expect(storage.value).toEqual({ q1: 42, q2: 7 });
  });

  it("writes nothing when the link is already what it would be", async () => {
    const storage = new FakeStorage();
    storage.value = { q1: 42 };
    const log = logger();
    const store = new BrowserSyncSharedQuerySourceStore(storage, log);

    await store.link("q1", 42);

    expect(storage.set).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it("refuses a link that names no usable work item", async () => {
    const storage = new FakeStorage();
    const store = new BrowserSyncSharedQuerySourceStore(storage);

    await store.link("q1", 0);

    expect(storage.set).not.toHaveBeenCalled();
  });

  it("unlinks one query without disturbing the rest, and no-ops when it has no link", async () => {
    const storage = new FakeStorage();
    storage.value = { q1: 42, q2: 7 };
    const log = logger();
    const store = new BrowserSyncSharedQuerySourceStore(storage, log);

    await store.unlink("q1");
    expect(storage.value).toEqual({ q2: 7 });
    expect(log.info).toHaveBeenCalledWith(
      "Query q1 no longer reads its configuration from work item 42",
    );

    storage.set.mockClear();
    await store.unlink("missing");
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("normalizes what it reads back out of storage", async () => {
    const storage = new FakeStorage();
    storage.value = { q1: 42, q2: "nope" };

    await expect(new BrowserSyncSharedQuerySourceStore(storage).read()).resolves.toEqual({
      q1: 42,
    });
  });

  it("projects only its own key to observers", async () => {
    const storage = new FakeStorage();
    storage.value = { q1: 42 };
    const seen: unknown[] = [];

    const observation = new BrowserSyncSharedQuerySourceStore(storage).observe((sources) => {
      seen.push(sources);
    });
    await observation.ready;
    observation.unsubscribe();

    expect(seen).toEqual([{ q1: 42 }]);
  });
});
