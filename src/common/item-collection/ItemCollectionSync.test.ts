import { describe, expect, it } from "vitest";

import type { IBrowserSyncStorage } from "../browser/IBrowserSyncStorage";
import type { ILogger } from "../logging/ILogger";

import { type CollectedItem, ItemCollection } from "./ItemCollection";
import { ItemCollectionSync } from "./ItemCollectionSync";
import { encodeItemCollection } from "./storedItemCollection";

/**
 * One synced storage area shared by several tabs. Writes commit at once; change events wait for
 * `deliver()`, so a test controls when each tab hears about a write — as the browser does, in
 * commit order.
 */
class SharedSyncArea {
  value: unknown;
  failNextWrite: Error | null = null;
  readonly listeners = new Set<(value: unknown) => void>();
  private readonly queue: unknown[] = [];

  tab(): IBrowserSyncStorage {
    return {
      get: () => Promise.resolve(this.value),
      set: (_key, value) => {
        if (this.failNextWrite !== null) {
          const failure = this.failNextWrite;
          this.failNextWrite = null;
          return Promise.reject(failure);
        }
        this.write(value);
        return Promise.resolve();
      },
      subscribe: (_key, listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
  }

  write(value: unknown): void {
    this.value = structuredClone(value);
    this.queue.push(this.value);
  }

  deliver(): void {
    for (const value of this.queue.splice(0)) {
      for (const listener of [...this.listeners]) listener(structuredClone(value));
    }
  }
}

function fakeLogger(): ILogger & { infos: string[]; errors: unknown[] } {
  const infos: string[] = [];
  const errors: unknown[] = [];
  return {
    infos,
    errors,
    info: (message) => infos.push(message),
    error: (_message, error) => errors.push(error),
  };
}

const item = (id: number): CollectedItem => ({
  id,
  title: `Item ${id}`,
  type: "Bug",
  url: `https://dev.azure.com/o/p/_workitems/edit/${id}`,
});

async function openTab(area: SharedSyncArea, logger = fakeLogger()) {
  const collection = new ItemCollection(fakeLogger());
  const disconnect = new ItemCollectionSync(collection, area.tab(), logger).connect();
  await Promise.resolve();
  await Promise.resolve();
  return { collection, disconnect, logger };
}

const ids = (collection: ItemCollection): number[] => collection.items().map((entry) => entry.id);

describe("ItemCollectionSync across tabs", () => {
  it("continues a running collection in a tab opened later", async () => {
    const area = new SharedSyncArea();
    const first = await openTab(area);
    first.collection.start();
    first.collection.toggle(item(1));
    area.deliver();
    const second = await openTab(area);
    expect(second.collection.isActive).toBe(true);
    expect(ids(second.collection)).toEqual([1]);
  });

  it("mirrors toggles and the end of the collection into other open tabs", async () => {
    const area = new SharedSyncArea();
    const first = await openTab(area);
    const second = await openTab(area);
    first.collection.start();
    area.deliver();
    second.collection.toggle(item(2));
    area.deliver();
    expect(ids(first.collection)).toEqual([2]);
    first.collection.end();
    area.deliver();
    expect(second.collection.isActive).toBe(false);
  });

  it("does not roll back while its own writes are still being reported", async () => {
    const area = new SharedSyncArea();
    const tab = await openTab(area);
    tab.collection.start();
    tab.collection.toggle(item(1));
    tab.collection.toggle(item(2));
    area.deliver();
    expect(ids(tab.collection)).toEqual([1, 2]);
  });

  it("lets its newer write win over another tab's write that landed first", async () => {
    const area = new SharedSyncArea();
    const tab = await openTab(area);
    area.write(encodeItemCollection({ items: [item(5)] }));
    tab.collection.start();
    area.deliver();
    expect(tab.collection.items()).toEqual([]);
    expect(area.value).toEqual(encodeItemCollection({ items: [] }));
  });

  it("ignores another tab's write that its own later write overwrote", async () => {
    const area = new SharedSyncArea();
    const tab = await openTab(area);
    tab.collection.start();
    area.write(encodeItemCollection({ items: [item(3)] }));
    tab.collection.toggle(item(4));
    area.deliver();
    expect(ids(tab.collection)).toEqual([4]);
  });

  it("stops following storage once disconnected", async () => {
    const area = new SharedSyncArea();
    const tab = await openTab(area);
    tab.disconnect();
    area.write(encodeItemCollection({ items: [item(1)] }));
    area.deliver();
    expect(tab.collection.isActive).toBe(false);
    expect(area.listeners.size).toBe(0);
  });
});

describe("ItemCollectionSync failures", () => {
  it("logs a failed write and keeps applying later stored changes", async () => {
    const area = new SharedSyncArea();
    const tab = await openTab(area);
    const failure = new Error("quota");
    area.failNextWrite = failure;
    tab.collection.start();
    await Promise.resolve();
    expect(tab.logger.errors).toEqual([failure]);
    area.write(encodeItemCollection({ items: [item(8)] }));
    area.deliver();
    expect(ids(tab.collection)).toEqual([8]);
  });

  it("logs an unreadable synced collection", async () => {
    const area = new SharedSyncArea();
    const failure = new Error("read");
    const storage = { ...area.tab(), get: () => Promise.reject(failure) };
    const logger = fakeLogger();
    new ItemCollectionSync(new ItemCollection(fakeLogger()), storage, logger).connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logger.errors).toEqual([failure]);
  });

  it("skips writes past the sync size limit, logging only when crossing it", async () => {
    const area = new SharedSyncArea();
    const tab = await openTab(area);
    tab.collection.start();
    for (let id = 1; id <= 600; id += 1) tab.collection.toggle(item(id));
    area.deliver();
    expect(tab.logger.errors).toHaveLength(1);
    const stored = area.value as { items: unknown[] };
    expect(stored.items.length).toBeLessThan(600);
    for (let id = 1; id <= 300; id += 1) tab.collection.remove(id);
    expect(tab.logger.infos).toEqual(["The work item collection fits the sync size limit again."]);
    expect(area.value).toEqual(encodeItemCollection({ items: tab.collection.items() }));
  });
});
