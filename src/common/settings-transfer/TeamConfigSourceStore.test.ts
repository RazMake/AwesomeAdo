import { describe, expect, it, vi } from "vitest";

import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import type { ILogger } from "../logging/ILogger";

import { BrowserSyncTeamConfigSourceStore, normalizeWorkItemId } from "./TeamConfigSourceStore";

class FakeStorage implements IBrowserSyncStorage {
  value: unknown;
  listener: ((value: unknown) => void) | null = null;
  readonly stop = vi.fn();
  readonly set = vi.fn(async (_key: string, value: unknown): Promise<void> => {
    this.value = value;
  });

  async get(): Promise<unknown> {
    return this.value;
  }

  subscribe(_key: string, listener: (value: unknown) => void): () => void {
    this.listener = listener;
    return this.stop;
  }
}

const logger = (): ILogger => ({
  info: vi.fn(),
  error: vi.fn(),
});

describe("normalizeWorkItemId", () => {
  it.each([undefined, null, "42", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects %s",
    (value) => {
      expect(normalizeWorkItemId(value)).toBeNull();
    },
  );

  it("accepts a positive safe integer", () => {
    expect(normalizeWorkItemId(42)).toBe(42);
  });
});

describe("BrowserSyncTeamConfigSourceStore", () => {
  it("normalizes reads and persists the trusted source separately", async () => {
    const storage = new FakeStorage();
    const log = logger();
    const store = new BrowserSyncTeamConfigSourceStore(storage, log);

    storage.value = "42";
    await expect(store.read()).resolves.toBeNull();

    await store.write(42);
    expect(storage.set).toHaveBeenCalledWith("teamConfig.workItemId", 42);
    expect(log.info).toHaveBeenCalledWith("Team configuration connected");

    await store.write(null);
    expect(storage.set).toHaveBeenLastCalledWith("teamConfig.workItemId", null);
    expect(log.info).toHaveBeenLastCalledWith("Team configuration disconnected");
  });

  it("emits the connection on subscribe and again whenever it changes", async () => {
    const storage = new FakeStorage();
    storage.value = 42;
    const store = new BrowserSyncTeamConfigSourceStore(storage);
    const seen: (number | null)[] = [];

    const observation = store.observe((workItemId) => seen.push(workItemId));
    await observation.ready;

    // A disconnect elsewhere (another device, or the Disconnect button) must reach the subscriber as
    // null rather than leave it showing a connection that no longer exists.
    storage.listener?.(null);
    storage.listener?.("not an id");
    observation.unsubscribe();

    expect(seen).toEqual([42, null, null]);
    expect(storage.stop).toHaveBeenCalledTimes(1);
  });
});
