import type { ILogger } from "../logging/ILogger";
import { parseAdoQueryId } from "../navigation/AdoQueryRoute";
import type { QueryFavoritesPaths } from "../settings/QueryFavoritesPaths";

import type { FavoriteLink, Favorites } from "./Favorites";

export const SYNC_CATALOG_FAVORITES = "awesomeado:sync-catalog-favorites";

export interface CatalogFavoritesRequest {
  type: typeof SYNC_CATALOG_FAVORITES;
  queryId: string;
  path: string;
  links: readonly FavoriteLink[];
}

export interface CatalogFavoritesResponse {
  ok: boolean;
  error?: string;
}

export function claimsCatalogFavorites(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === SYNC_CATALOG_FAVORITES
  );
}

function isQueryLink(value: unknown): value is FavoriteLink {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FavoriteLink>;
  return (
    typeof candidate.title === "string" &&
    candidate.title.trim() !== "" &&
    typeof candidate.url === "string" &&
    parseAdoQueryId(candidate.url) !== null
  );
}

function isValidRequest(value: unknown): value is CatalogFavoritesRequest {
  if (!claimsCatalogFavorites(value)) return false;
  const candidate = value as Partial<CatalogFavoritesRequest>;
  return (
    typeof candidate.queryId === "string" &&
    typeof candidate.path === "string" &&
    Array.isArray(candidate.links) &&
    candidate.links.length > 0 &&
    candidate.links.every(isQueryLink)
  );
}

export class CatalogFavoritesHandler {
  constructor(
    private readonly paths: Pick<QueryFavoritesPaths, "read">,
    private readonly favorites: Favorites,
    private readonly logger: ILogger,
  ) {}

  async serve(message: unknown, tabUrl: string): Promise<CatalogFavoritesResponse> {
    try {
      if (!isValidRequest(message) || parseAdoQueryId(tabUrl) !== message.queryId) {
        throw new Error("Favorites sync requires the catalog's own Azure DevOps query tab.");
      }
      const last = message.links.at(-1);
      if (last === undefined || parseAdoQueryId(last.url) !== message.queryId) {
        throw new Error("The final Favorite must point to the catalog query.");
      }
      const path = await this.paths.read(message.queryId);
      if (path.trim() === "" || path !== message.path) {
        throw new Error(
          "The Favorites path changed. Reopen Sync projects to Favorites and try again.",
        );
      }
      await this.favorites.replace(path, message.links);
      return { ok: true };
    } catch (error) {
      this.logger.error("Catalog Favorites sync failed", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export async function sendCatalogFavorites(
  send: (request: CatalogFavoritesRequest) => Promise<CatalogFavoritesResponse | undefined>,
  request: Omit<CatalogFavoritesRequest, "type">,
): Promise<void> {
  const response = await send({ type: SYNC_CATALOG_FAVORITES, ...request });
  if (!response?.ok) throw new Error(response?.error ?? "The Favorites worker did not respond.");
}
