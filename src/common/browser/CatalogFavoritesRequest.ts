import type {
  CatalogFavoritesStatus,
  CatalogFavoritesSyncResult,
  FavoriteLink,
  FavoritesRestoreOutcome,
} from "./Favorites";

export const SYNC_CATALOG_FAVORITES = "awesomeado:sync-catalog-favorites";
export const CATALOG_FAVORITES_STATUS = "awesomeado:catalog-favorites-status";
export const RESTORE_CATALOG_FAVORITES = "awesomeado:restore-catalog-favorites";

export interface CatalogFavoritesStatusRequest {
  type: typeof CATALOG_FAVORITES_STATUS;
  queryId: string;
}

export interface CatalogFavoritesRequest {
  type: typeof SYNC_CATALOG_FAVORITES;
  queryId: string;
  path: string;
  links: readonly FavoriteLink[];
  /** Existing favorite ids the user chose to keep. */
  keep: readonly string[];
}

export interface CatalogFavoritesRestoreRequest {
  type: typeof RESTORE_CATALOG_FAVORITES;
  queryId: string;
  syncId: string;
  ids: readonly string[];
}

type WorkerResponse<T> = ({ ok: true } & T) | { ok: false; error: string };

export type CatalogFavoritesStatusResponse = WorkerResponse<CatalogFavoritesStatus>;
export type CatalogFavoritesResponse = WorkerResponse<CatalogFavoritesSyncResult>;
export type CatalogFavoritesRestoreResponse = WorkerResponse<FavoritesRestoreOutcome>;

export function claimsCatalogFavoritesStatus(
  value: unknown,
): value is CatalogFavoritesStatusRequest {
  return claims(value, CATALOG_FAVORITES_STATUS);
}

export function claimsCatalogFavorites(value: unknown): value is CatalogFavoritesRequest {
  return claims(value, SYNC_CATALOG_FAVORITES);
}

export function claimsCatalogFavoritesRestore(
  value: unknown,
): value is CatalogFavoritesRestoreRequest {
  return claims(value, RESTORE_CATALOG_FAVORITES);
}

export async function requestCatalogFavoritesStatus(
  send: (
    request: CatalogFavoritesStatusRequest,
  ) => Promise<CatalogFavoritesStatusResponse | undefined>,
  queryId: string,
): Promise<CatalogFavoritesStatus> {
  return unwrapResponse(await send({ type: CATALOG_FAVORITES_STATUS, queryId }));
}

export async function sendCatalogFavorites(
  send: (request: CatalogFavoritesRequest) => Promise<CatalogFavoritesResponse | undefined>,
  request: Omit<CatalogFavoritesRequest, "type">,
): Promise<CatalogFavoritesSyncResult> {
  return unwrapResponse(await send({ type: SYNC_CATALOG_FAVORITES, ...request }));
}

export async function sendCatalogFavoritesRestore(
  send: (
    request: CatalogFavoritesRestoreRequest,
  ) => Promise<CatalogFavoritesRestoreResponse | undefined>,
  request: Omit<CatalogFavoritesRestoreRequest, "type">,
): Promise<FavoritesRestoreOutcome> {
  return unwrapResponse(await send({ type: RESTORE_CATALOG_FAVORITES, ...request }));
}

function claims(value: unknown, type: string): boolean {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === type;
}

function unwrapResponse<T>(response: unknown): T {
  if (!isResponse(response)) throw new Error("The Favorites worker did not respond.");
  if (!response.ok) {
    if (typeof response.error !== "string") {
      throw new Error("The Favorites worker did not respond.");
    }
    throw new Error(response.error);
  }
  const { ok, ...payload } = response;
  void ok;
  return payload as T;
}

function isResponse(value: unknown): value is { ok: boolean; error?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}
