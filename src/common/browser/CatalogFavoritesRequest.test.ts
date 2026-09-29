import { describe, expect, it } from "vitest";

import {
  CATALOG_FAVORITES_STATUS,
  claimsCatalogFavorites,
  claimsCatalogFavoritesRestore,
  claimsCatalogFavoritesStatus,
  requestCatalogFavoritesStatus,
  RESTORE_CATALOG_FAVORITES,
  sendCatalogFavorites,
  sendCatalogFavoritesRestore,
  SYNC_CATALOG_FAVORITES,
} from "./CatalogFavoritesRequest";

const QUERY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const REQUEST = {
  queryId: QUERY_ID,
  path: "Work",
  links: [
    { title: "Catalog", url: `https://dev.azure.com/org/project/_queries/query/${QUERY_ID}` },
  ],
  keep: [],
};

describe("Catalog Favorites worker request contracts", () => {
  it("claims only its three message types", () => {
    expect(claimsCatalogFavoritesStatus({ type: CATALOG_FAVORITES_STATUS })).toBe(true);
    expect(claimsCatalogFavorites({ type: SYNC_CATALOG_FAVORITES })).toBe(true);
    expect(claimsCatalogFavoritesRestore({ type: RESTORE_CATALOG_FAVORITES })).toBe(true);
    expect(claimsCatalogFavorites({ type: "other" })).toBe(false);
  });

  it("sends and unwraps successful status, sync, and restore responses", async () => {
    await expect(
      requestCatalogFavoritesStatus(
        async () => ({ ok: true, path: "Work", refusal: null, existing: [] }),
        QUERY_ID,
      ),
    ).resolves.toEqual({ path: "Work", refusal: null, existing: [] });
    await expect(
      sendCatalogFavorites(async () => ({ ok: true, syncId: "sync", removed: [] }), REQUEST),
    ).resolves.toEqual({ syncId: "sync", removed: [] });
    await expect(
      sendCatalogFavoritesRestore(async () => ({ ok: true, restored: ["one"], failed: [] }), {
        queryId: QUERY_ID,
        syncId: "sync",
        ids: ["one"],
      }),
    ).resolves.toEqual({ restored: ["one"], failed: [] });
  });

  it.each([
    [
      "status",
      () => requestCatalogFavoritesStatus(async () => ({ ok: false, error: "Refused" }), QUERY_ID),
    ],
    ["sync", () => sendCatalogFavorites(async () => ({ ok: false, error: "Refused" }), REQUEST)],
    [
      "restore",
      () =>
        sendCatalogFavoritesRestore(async () => ({ ok: false, error: "Refused" }), {
          queryId: QUERY_ID,
          syncId: "sync",
          ids: ["one"],
        }),
    ],
  ])("throws worker errors for %s", async (_name, send) => {
    await expect(send()).rejects.toThrow("Refused");
  });

  it.each([
    () => requestCatalogFavoritesStatus(async () => undefined, QUERY_ID),
    () => sendCatalogFavorites(async () => ({}) as never, REQUEST),
    () =>
      sendCatalogFavoritesRestore(async () => undefined, {
        queryId: QUERY_ID,
        syncId: "sync",
        ids: ["one"],
      }),
  ])("rejects missing or malformed worker replies", async (send) => {
    await expect(send()).rejects.toThrow("The Favorites worker did not respond.");
  });
});
