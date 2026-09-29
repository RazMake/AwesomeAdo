import { describe, expect, it } from "vitest";

import type { IBrowserSessionStorage } from "./IBrowserSessionStorage";
import {
  SessionRemovedFavoritesRecords,
  type RemovedFavoritesRecord,
} from "./RemovedFavoritesRecords";

class FakeSessionStorage implements IBrowserSessionStorage {
  readonly values = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

function createRecord(queryId = "catalog-one"): RemovedFavoritesRecord {
  return {
    syncId: "sync-one",
    queryId,
    folderId: "folder-one",
    path: "Work/Projects",
    removed: [{ id: "bookmark-one", title: "Project one", url: "https://example.test/one" }],
  };
}

function recordKey(queryId: string): string {
  return `catalogFavorites.removed.${queryId}`;
}

describe("SessionRemovedFavoritesRecords", () => {
  it("round-trips a record for its catalog", async () => {
    const records = new SessionRemovedFavoritesRecords(new FakeSessionStorage());
    const record = createRecord();

    await records.write(record);

    await expect(records.read(record.queryId)).resolves.toEqual(record);
  });

  it("uses separate keys for separate catalogs", async () => {
    const records = new SessionRemovedFavoritesRecords(new FakeSessionStorage());
    const first = createRecord("catalog-one");
    const second = createRecord("catalog-two");

    await records.write(first);
    await records.write(second);

    await expect(records.read(first.queryId)).resolves.toEqual(first);
    await expect(records.read(second.queryId)).resolves.toEqual(second);
  });

  it("rejects malformed stored values", async () => {
    const storage = new FakeSessionStorage();
    const records = new SessionRemovedFavoritesRecords(storage);
    const malformedValues: unknown[] = [
      null,
      "not a record",
      [],
      { ...createRecord(), syncId: 3 },
      { ...createRecord(), queryId: 3 },
      { ...createRecord(), folderId: 3 },
      { ...createRecord(), path: 3 },
      { ...createRecord(), removed: "not an array" },
      { ...createRecord(), removed: [{ id: "one", title: "Title", url: 3 }] },
      { ...createRecord(), removed: [{ id: "one", title: "Title" }] },
    ];

    for (const value of malformedValues) {
      storage.values.set(recordKey("catalog-one"), value);

      await expect(records.read("catalog-one")).resolves.toBeNull();
    }
  });

  it("rejects a record stored for a different catalog", async () => {
    const storage = new FakeSessionStorage();
    const records = new SessionRemovedFavoritesRecords(storage);
    storage.values.set(recordKey("catalog-one"), createRecord("catalog-two"));

    await expect(records.read("catalog-one")).resolves.toBeNull();
  });

  it("stores copies so later input mutations cannot change the pending restore", async () => {
    const storage = new FakeSessionStorage();
    const records = new SessionRemovedFavoritesRecords(storage);
    const removed = [{ id: "bookmark-one", title: "Project one", url: "https://example.test/one" }];
    const record = { ...createRecord(), removed };

    await records.write(record);
    removed.push({ id: "bookmark-two", title: "Project two", url: "https://example.test/two" });

    await expect(records.read(record.queryId)).resolves.toEqual(createRecord());
  });

  it("returns null after forgetting a catalog record", async () => {
    const records = new SessionRemovedFavoritesRecords(new FakeSessionStorage());
    const record = createRecord();

    await records.write(record);
    await records.forget(record.queryId);

    await expect(records.read(record.queryId)).resolves.toBeNull();
  });
});
