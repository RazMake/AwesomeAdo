import type { ILogger } from "../logging/ILogger";
import { parseAdoQueryId } from "../navigation/AdoQueryRoute";
import type { QueryFavoritesPaths } from "../settings/QueryFavoritesPaths";

import type {
  CatalogFavoritesRequest,
  CatalogFavoritesResponse,
  CatalogFavoritesRestoreRequest,
  CatalogFavoritesRestoreResponse,
  CatalogFavoritesStatusRequest,
  CatalogFavoritesStatusResponse,
} from "./CatalogFavoritesRequest";
import {
  FAVORITES_REFUSALS,
  normalizeFavoritesFolderPath,
  type CatalogFavoritesStatus,
  type Favorites,
  type FavoritesRestoreOutcome,
  type RemovedFavorite,
} from "./Favorites";
import type { FavoritesAccess } from "./FavoritesAccess";
import type { RemovedFavoritesRecord, RemovedFavoritesRecords } from "./RemovedFavoritesRecords";

export interface CatalogFavoritesHandlerDependencies {
  paths: Pick<QueryFavoritesPaths, "read">;
  favorites: Favorites;
  access: Pick<FavoritesAccess, "isGranted">;
  records: RemovedFavoritesRecords;
  createSyncId(): string;
  logger: ILogger;
}

export class CatalogFavoritesHandler {
  constructor(private readonly dependencies: CatalogFavoritesHandlerDependencies) {}

  async status(message: unknown, tabUrl: string): Promise<CatalogFavoritesStatusResponse> {
    try {
      const request = statusRequest(message);
      requireCatalogSender(request.queryId, tabUrl);
      const assessment = await this.assess(request.queryId);
      return { ok: true, ...assessment };
    } catch (error) {
      return this.failure("Catalog Favorites status failed", error);
    }
  }

  async sync(message: unknown, tabUrl: string): Promise<CatalogFavoritesResponse> {
    try {
      const request = syncRequest(message);
      requireCatalogSender(request.queryId, tabUrl);
      requireCatalogLink(request);
      const assessment = await this.assess(request.queryId);
      const path = requireSyncPath(request.path, assessment);
      const replacement = await this.dependencies.favorites.replace(
        path,
        request.links,
        request.keep,
      );
      const syncId = this.dependencies.createSyncId();
      await this.updateRecord(syncId, request.queryId, path, replacement);
      this.dependencies.logger.info(
        `Catalog Favorites sync completed for query ${request.queryId}: ${request.links.length} links written, ${replacement.removed.length} favorites removed.`,
      );
      return { ok: true, syncId, removed: replacement.removed };
    } catch (error) {
      return this.failure("Catalog Favorites sync failed", error);
    }
  }

  async restore(message: unknown, tabUrl: string): Promise<CatalogFavoritesRestoreResponse> {
    try {
      const request = restoreRequest(message);
      requireCatalogSender(request.queryId, tabUrl);
      await this.requireAccess();
      const record = await this.currentRecord(request);
      const selected = selectedFavorites(record.removed, request.ids);
      const outcome = await this.dependencies.favorites.restore(record.folderId, selected);
      await this.updateRestoredRecord(record, outcome);
      this.dependencies.logger.info(
        `Catalog Favorites restore completed for query ${request.queryId}: ${outcome.restored.length} restored, ${outcome.failed.length} failed.`,
      );
      return { ok: true, ...outcome };
    } catch (error) {
      return this.failure("Catalog Favorites restore failed", error);
    }
  }

  private async assess(queryId: string): Promise<CatalogFavoritesStatus> {
    const path = await this.dependencies.paths.read(queryId);
    if (path === "") return { path, refusal: FAVORITES_REFUSALS.noFolder, existing: [] };
    if (!(await this.dependencies.access.isGranted())) {
      return { path, refusal: FAVORITES_REFUSALS.noAccess, existing: [] };
    }
    const refusal = await this.dependencies.favorites.inspect(path);
    if (refusal !== null) return { path, refusal, existing: [] };
    return { path, refusal, existing: await this.dependencies.favorites.existing(path) };
  }

  private async requireAccess(): Promise<void> {
    if (!(await this.dependencies.access.isGranted())) {
      throw new Error(FAVORITES_REFUSALS.noAccess);
    }
  }

  private async currentRecord(
    request: CatalogFavoritesRestoreRequest,
  ): Promise<RemovedFavoritesRecord> {
    const record = await this.dependencies.records.read(request.queryId);
    if (record === null || record.syncId !== request.syncId) {
      throw new Error(FAVORITES_REFUSALS.restoreGone);
    }
    return record;
  }

  private async updateRecord(
    syncId: string,
    queryId: string,
    path: string,
    replacement: { folderId: string; removed: readonly RemovedFavorite[] },
  ): Promise<void> {
    try {
      if (replacement.removed.length === 0) {
        await this.dependencies.records.forget(queryId);
        return;
      }
      await this.dependencies.records.write({
        syncId,
        queryId,
        folderId: replacement.folderId,
        path,
        removed: replacement.removed,
      });
    } catch (error) {
      this.dependencies.logger.error("Catalog Favorites sync record update failed", error);
    }
  }

  private async updateRestoredRecord(
    record: RemovedFavoritesRecord,
    outcome: FavoritesRestoreOutcome,
  ): Promise<void> {
    try {
      const remaining = record.removed.filter(
        (favorite) => !outcome.restored.includes(favorite.id),
      );
      if (remaining.length === 0) {
        await this.dependencies.records.forget(record.queryId);
        return;
      }
      await this.dependencies.records.write({ ...record, removed: remaining });
    } catch (error) {
      this.dependencies.logger.error("Catalog Favorites restore record update failed", error);
    }
  }

  private failure(message: string, error: unknown): { ok: false; error: string } {
    this.dependencies.logger.error(message, error);
    return { ok: false, error: errorMessage(error) };
  }
}

function statusRequest(message: unknown): CatalogFavoritesStatusRequest {
  if (
    !isMessage(message, "awesomeado:catalog-favorites-status") ||
    typeof message.queryId !== "string"
  ) {
    throw new Error("Favorites status requires the catalog's own Azure DevOps query tab.");
  }
  return message as CatalogFavoritesStatusRequest;
}

function syncRequest(message: unknown): CatalogFavoritesRequest {
  if (
    !isMessage(message, "awesomeado:sync-catalog-favorites") ||
    typeof message.queryId !== "string" ||
    typeof message.path !== "string" ||
    !Array.isArray(message.links) ||
    message.links.length === 0 ||
    !message.links.every(isQueryLink) ||
    !isKeepList(message.keep)
  ) {
    throw new Error("Favorites sync requires the catalog's own Azure DevOps query tab.");
  }
  return message as CatalogFavoritesRequest;
}

function restoreRequest(message: unknown): CatalogFavoritesRestoreRequest {
  if (
    !isMessage(message, "awesomeado:restore-catalog-favorites") ||
    typeof message.queryId !== "string" ||
    typeof message.syncId !== "string" ||
    !isUniqueStrings(message.ids)
  ) {
    throw new Error("Favorites restore requires the catalog's own Azure DevOps query tab.");
  }
  return message as CatalogFavoritesRestoreRequest;
}

function isMessage(
  message: unknown,
  type: string,
): message is {
  type: string;
  queryId: unknown;
  path?: unknown;
  links?: unknown;
  syncId?: unknown;
  ids?: unknown;
  keep?: unknown;
} {
  return (
    typeof message === "object" && message !== null && (message as { type?: unknown }).type === type
  );
}

function isQueryLink(value: unknown): value is { title: string; url: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string" &&
    (value as { title: string }).title.trim() !== "" &&
    typeof (value as { url?: unknown }).url === "string" &&
    parseAdoQueryId((value as { url: string }).url) !== null
  );
}

function isKeepList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

function isUniqueStrings(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((id) => typeof id === "string") &&
    new Set(value).size === value.length
  );
}

function requireCatalogSender(queryId: string, tabUrl: string): void {
  if (parseAdoQueryId(tabUrl) !== queryId) {
    throw new Error("Favorites sync requires the catalog's own Azure DevOps query tab.");
  }
}

function requireCatalogLink(request: CatalogFavoritesRequest): void {
  const last = request.links.at(-1);
  if (last === undefined || parseAdoQueryId(last.url) !== request.queryId) {
    throw new Error("The final Favorite must point to the catalog query.");
  }
}

function requireSyncPath(path: string, assessment: CatalogFavoritesStatus): string {
  if (assessment.refusal !== null) throw new Error(assessment.refusal);
  if (normalizeFavoritesFolderPath(path) !== assessment.path) {
    throw new Error(FAVORITES_REFUSALS.pathChanged);
  }
  return assessment.path;
}

function selectedFavorites(
  removed: readonly RemovedFavorite[],
  ids: readonly string[],
): readonly RemovedFavorite[] {
  const selectedIds = new Set(ids);
  if (ids.some((id) => !removed.some((favorite) => favorite.id === id))) {
    throw new Error(FAVORITES_REFUSALS.restoreUnknown);
  }
  return removed.filter((favorite) => selectedIds.has(favorite.id));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
