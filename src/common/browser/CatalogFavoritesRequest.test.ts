import { describe, expect, it, vi } from "vitest";

import {
  CatalogFavoritesHandler,
  claimsCatalogFavorites,
  sendCatalogFavorites,
  SYNC_CATALOG_FAVORITES,
} from "./CatalogFavoritesRequest";

const QUERY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const URL = `https://dev.azure.com/org/project/_queries/query/${QUERY_ID}?tags=api`;
const REQUEST = {
  type: SYNC_CATALOG_FAVORITES,
  queryId: QUERY_ID,
  path: "Work",
  links: [{ title: "Catalog", url: URL }],
};

function harness() {
  const paths = { read: vi.fn(async () => "Work") };
  const favorites = { folderPaths: vi.fn(async () => []), replace: vi.fn(async () => {}) };
  const logger = { info: vi.fn(), error: vi.fn() };
  return {
    paths,
    favorites,
    logger,
    handler: new CatalogFavoritesHandler(paths, favorites, logger),
  };
}

describe("catalog Favorites worker boundary", () => {
  it("uses the stored destination for a request from the catalog tab", async () => {
    const { handler, favorites } = harness();
    expect(await handler.serve(REQUEST, URL)).toEqual({ ok: true });
    expect(favorites.replace).toHaveBeenCalledWith("Work", REQUEST.links);
  });

  it.each([
    null,
    {},
    { ...REQUEST, links: [] },
    { ...REQUEST, links: [{ title: "Bad", url: "javascript:alert(1)" }] },
  ])("rejects malformed requests before changing Favorites", async (request) => {
    const { handler, favorites, logger } = harness();
    expect((await handler.serve(request, URL)).ok).toBe(false);
    expect(favorites.replace).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("refuses a different sender query, an absent destination, and a changed destination", async () => {
    const { handler, favorites, paths } = harness();
    expect((await handler.serve(REQUEST, "https://example.com")).ok).toBe(false);
    paths.read.mockResolvedValueOnce("");
    expect((await handler.serve(REQUEST, URL)).ok).toBe(false);
    paths.read.mockResolvedValueOnce("Different");
    expect((await handler.serve(REQUEST, URL)).ok).toBe(false);
    expect(favorites.replace).not.toHaveBeenCalled();
  });

  it("surfaces bookmark errors and missing worker replies", async () => {
    const { handler, favorites } = harness();
    favorites.replace.mockRejectedValueOnce(new Error("No permission"));
    expect(await handler.serve(REQUEST, URL)).toEqual({ ok: false, error: "No permission" });
    await expect(sendCatalogFavorites(async () => undefined, REQUEST)).rejects.toThrow(
      "did not respond",
    );
    await expect(
      sendCatalogFavorites(async () => ({ ok: false, error: "Refused" }), REQUEST),
    ).rejects.toThrow("Refused");
    await expect(
      sendCatalogFavorites(async () => ({ ok: true }), REQUEST),
    ).resolves.toBeUndefined();
    expect(claimsCatalogFavorites(REQUEST)).toBe(true);
    expect(claimsCatalogFavorites({ type: "other" })).toBe(false);
  });
});
