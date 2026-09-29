import { describe, expect, it, vi } from "vitest";

import { CatalogFavoritesHandler } from "./CatalogFavoritesHandler";
import {
  CATALOG_FAVORITES_STATUS,
  RESTORE_CATALOG_FAVORITES,
  SYNC_CATALOG_FAVORITES,
} from "./CatalogFavoritesRequest";
import type { Favorites, RemovedFavorite } from "./Favorites";
import { FAVORITES_REFUSALS } from "./Favorites";
import type { RemovedFavoritesRecord } from "./RemovedFavoritesRecords";

const QUERY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const URL = `https://dev.azure.com/org/project/_queries/query/${QUERY_ID}`;
const STATUS = { type: CATALOG_FAVORITES_STATUS, queryId: QUERY_ID };
const SYNC = {
  type: SYNC_CATALOG_FAVORITES,
  queryId: QUERY_ID,
  path: "Work",
  links: [{ title: "Catalog", url: URL }],
  keep: ["kept"],
};
const REMOVED: readonly RemovedFavorite[] = [
  { id: "one", title: "One", url: "https://example.com/one" },
  { id: "two", title: "Two", url: "https://example.com/two" },
];

function harness() {
  const paths = { read: vi.fn(async () => "Work") };
  const favorites = {
    folderPaths: vi.fn<Favorites["folderPaths"]>(async () => []),
    inspect: vi.fn<Favorites["inspect"]>(async () => null),
    existing: vi.fn<Favorites["existing"]>(async () => []),
    replace: vi.fn<Favorites["replace"]>(async () => ({ folderId: "folder", removed: [] })),
    restore: vi.fn<Favorites["restore"]>(async () => ({ restored: [], failed: [] })),
  } satisfies Favorites;
  const access = { isGranted: vi.fn(async () => true) };
  const records = {
    read: vi.fn<(queryId: string) => Promise<RemovedFavoritesRecord | null>>(async () => null),
    write: vi.fn<(record: RemovedFavoritesRecord) => Promise<void>>(async () => undefined),
    forget: vi.fn<(queryId: string) => Promise<void>>(async () => undefined),
  };
  const logger = { info: vi.fn(), error: vi.fn() };
  return {
    paths,
    favorites,
    access,
    records,
    logger,
    handler: new CatalogFavoritesHandler({
      paths,
      favorites,
      access,
      records,
      createSyncId: () => "sync",
      logger,
    }),
  };
}

function restore(ids: readonly string[], syncId = "sync") {
  return { type: RESTORE_CATALOG_FAVORITES, queryId: QUERY_ID, syncId, ids };
}

describe("CatalogFavoritesHandler status", () => {
  it.each([
    [
      "no configured folder",
      (test: ReturnType<typeof harness>) => test.paths.read.mockResolvedValue(""),
      "",
      FAVORITES_REFUSALS.noFolder,
    ],
    [
      "no permission",
      (test: ReturnType<typeof harness>) => test.access.isGranted.mockResolvedValue(false),
      "Work",
      FAVORITES_REFUSALS.noAccess,
    ],
    [
      "unsafe destination",
      (test: ReturnType<typeof harness>) => test.favorites.inspect.mockResolvedValue("unsafe"),
      "Work",
      "unsafe",
    ],
  ])("reports %s", async (_name, configure, path, refusal) => {
    const test = harness();
    configure(test);
    expect(await test.handler.status(STATUS, URL)).toEqual({
      ok: true,
      path,
      refusal,
      existing: [],
    });
  });

  it("returns an available destination and its existing links without routine logging", async () => {
    const test = harness();
    test.favorites.existing.mockResolvedValueOnce(REMOVED);
    expect(await test.handler.status(STATUS, URL)).toEqual({
      ok: true,
      path: "Work",
      refusal: null,
      existing: REMOVED,
    });
    expect(test.favorites.existing).toHaveBeenCalledWith("Work");
    expect(test.logger.info).not.toHaveBeenCalled();
    expect(test.logger.error).not.toHaveBeenCalled();
  });

  it("rejects malformed requests and a different query sender", async () => {
    const test = harness();
    expect((await test.handler.status({}, URL)).ok).toBe(false);
    expect((await test.handler.status(STATUS, "https://example.com")).ok).toBe(false);
    expect(test.logger.error).toHaveBeenCalledTimes(2);
  });

  it("logs assessment failures", async () => {
    const test = harness();
    test.favorites.inspect.mockRejectedValueOnce(new Error("broken"));
    await expect(test.handler.status(STATUS, URL)).resolves.toEqual({ ok: false, error: "broken" });
    expect(test.logger.error).toHaveBeenCalledWith(
      "Catalog Favorites status failed",
      expect.any(Error),
    );
  });
});

describe("CatalogFavoritesHandler sync", () => {
  it("rejects malformed requests, a different sender, and a non-catalog final link", async () => {
    const test = harness();
    const otherQueryId = "ffffffff-1111-2222-3333-444444444444";
    expect((await test.handler.sync({ ...SYNC, links: [] }, URL)).ok).toBe(false);
    expect((await test.handler.sync({ ...SYNC, keep: [1] }, URL)).ok).toBe(false);
    expect((await test.handler.sync({ ...SYNC, keep: undefined }, URL)).ok).toBe(false);
    expect((await test.handler.sync(SYNC, "https://example.com")).ok).toBe(false);
    expect(
      (
        await test.handler.sync(
          {
            ...SYNC,
            links: [
              {
                title: "Other",
                url: `https://dev.azure.com/org/project/_queries/query/${otherQueryId}`,
              },
            ],
          },
          URL,
        )
      ).ok,
    ).toBe(false);
    expect(test.favorites.replace).not.toHaveBeenCalled();
  });

  it("blocks replacement for a refusal and path change", async () => {
    const test = harness();
    test.favorites.inspect.mockResolvedValueOnce("unsafe");
    expect((await test.handler.sync(SYNC, URL)).ok).toBe(false);
    expect(errorOf(await test.handler.sync({ ...SYNC, path: "Elsewhere" }, URL))).toBe(
      FAVORITES_REFUSALS.pathChanged,
    );
    expect(test.favorites.replace).not.toHaveBeenCalled();
  });

  it("records removed Favorites under the generated sync id", async () => {
    const test = harness();
    test.favorites.replace.mockResolvedValueOnce({ folderId: "folder", removed: REMOVED });
    await expect(test.handler.sync(SYNC, URL)).resolves.toEqual({
      ok: true,
      syncId: "sync",
      removed: REMOVED,
    });
    expect(test.favorites.replace).toHaveBeenCalledWith("Work", SYNC.links, ["kept"]);
    expect(test.records.write).toHaveBeenCalledWith({
      syncId: "sync",
      queryId: QUERY_ID,
      folderId: "folder",
      path: "Work",
      removed: REMOVED,
    });
  });

  it("forgets a previous record when no Favorites were removed", async () => {
    const test = harness();
    await test.handler.sync(SYNC, URL);
    expect(test.records.forget).toHaveBeenCalledWith(QUERY_ID);
  });

  it("logs record and replacement failures while preserving the replacement outcome", async () => {
    const test = harness();
    test.favorites.replace.mockResolvedValueOnce({ folderId: "folder", removed: REMOVED });
    test.records.write.mockRejectedValueOnce(new Error("record failed"));
    expect((await test.handler.sync(SYNC, URL)).ok).toBe(true);
    test.favorites.replace.mockRejectedValueOnce(new Error("replace failed"));
    await expect(test.handler.sync(SYNC, URL)).resolves.toEqual({
      ok: false,
      error: "replace failed",
    });
    expect(test.logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("CatalogFavoritesHandler restore", () => {
  it.each([
    [
      "no access",
      (test: ReturnType<typeof harness>) => test.access.isGranted.mockResolvedValue(false),
      "sync",
    ],
    ["missing record", () => undefined, "sync"],
    [
      "stale sync id",
      (test: ReturnType<typeof harness>) => test.records.read.mockResolvedValue(record()),
      "old",
    ],
    [
      "unknown id",
      (test: ReturnType<typeof harness>) => test.records.read.mockResolvedValue(record()),
      "sync",
    ],
  ])("refuses %s", async (_name, configure, syncId) => {
    const test = harness();
    configure(test);
    const ids = _name === "unknown id" ? ["unknown"] : ["one"];
    expect((await test.handler.restore(restore(ids, syncId), URL)).ok).toBe(false);
    expect(test.favorites.restore).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids and a different query sender", async () => {
    const test = harness();
    expect((await test.handler.restore(restore(["one", "one"]), URL)).ok).toBe(false);
    expect((await test.handler.restore(restore(["one"]), "https://example.com")).ok).toBe(false);
  });

  it("keeps only unrestored Favorites after a partial restore", async () => {
    const test = harness();
    test.records.read.mockResolvedValueOnce(record());
    test.favorites.restore.mockResolvedValueOnce({
      restored: ["one"],
      failed: [{ id: "two", error: "blocked" }],
    });
    await expect(test.handler.restore(restore(["two", "one"]), URL)).resolves.toEqual({
      ok: true,
      restored: ["one"],
      failed: [{ id: "two", error: "blocked" }],
    });
    expect(test.favorites.restore).toHaveBeenCalledWith("folder", REMOVED);
    expect(test.records.write).toHaveBeenCalledWith({ ...record(), removed: [REMOVED[1]] });
  });

  it("forgets fully restored records and logs record upkeep failures", async () => {
    const test = harness();
    test.records.read.mockResolvedValue(record());
    test.favorites.restore.mockResolvedValueOnce({ restored: ["one", "two"], failed: [] });
    await test.handler.restore(restore(["one", "two"]), URL);
    expect(test.records.forget).toHaveBeenCalledWith(QUERY_ID);
    test.favorites.restore.mockResolvedValueOnce({ restored: ["one"], failed: [] });
    test.records.write.mockRejectedValueOnce(new Error("record failed"));
    expect((await test.handler.restore(restore(["one"]), URL)).ok).toBe(true);
    expect(test.logger.error).toHaveBeenCalledWith(
      "Catalog Favorites restore record update failed",
      expect.any(Error),
    );
  });
});

function record(): RemovedFavoritesRecord {
  return { syncId: "sync", queryId: QUERY_ID, folderId: "folder", path: "Work", removed: REMOVED };
}

function errorOf(response: { ok: true } | { ok: false; error: string }): string | undefined {
  return response.ok ? undefined : response.error;
}
