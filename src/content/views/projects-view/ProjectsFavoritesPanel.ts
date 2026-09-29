import type {
  CatalogFavorites,
  CatalogFavoritesStatus,
  CatalogFavoritesSyncResult,
  FavoriteLink,
} from "../../../common/browser/Favorites";
import type { ILogger } from "../../../common/logging/ILogger";
import { renderConfirmPanel } from "../../../common/view-common/control/ConfirmPanel/ConfirmPanel";

import { FAVORITES_AVAILABILITY_TEXT } from "./CatalogFavoritesAvailability";
import { favoritesDeletedBySync, renderFavoritesKeepList } from "./FavoritesKeepList";
import { renderRemovedFavoritesList } from "./RemovedFavoritesList";

export interface CatalogFavoriteProject {
  id: number;
  title: string;
  url: string | null;
}

export interface ProjectsFavoritesOptions {
  queryId: string;
  projects: readonly CatalogFavoriteProject[];
  queriesKnown: boolean;
  catalog: FavoriteLink;
  favorites: CatalogFavorites;
  logger: ILogger;
  close(): void;
  onStatus(status: CatalogFavoritesStatus): void;
}

export function renderProjectsFavoritesPanel(
  doc: Document,
  options: ProjectsFavoritesOptions,
): HTMLElement {
  const panel = doc.createElement("div");
  panel.className = "awesomeado-projects-favorites";
  panel.style.cssText =
    "width:420px;max-width:80vw;max-height:70vh;overflow:auto;overflow-wrap:anywhere;font-size:12px";
  panel.setAttribute("role", "status");
  panel.textContent = "Checking Favorites folder...";
  void prepare(panel, options).catch((error: unknown) => showFailure(panel, options, error));
  return panel;
}

async function prepare(panel: HTMLElement, options: ProjectsFavoritesOptions): Promise<void> {
  const status = await options.favorites.status(options.queryId);
  options.onStatus(status);
  if (!panel.isConnected) return;
  if (status.refusal !== null) {
    options.logger.info(`Favorites sync for query ${options.queryId}: refused — ${status.refusal}`);
    panel.replaceChildren(
      renderConfirmPanel(panel.ownerDocument, {
        summary: status.refusal,
        choices: [
          {
            label: "Open Options",
            primary: true,
            onChoose: () => {
              options.logger.info(
                `Favorites sync for query ${options.queryId}: opening binding settings.`,
              );
              options.close();
              options.favorites.openSettings(options.queryId);
            },
          },
        ],
        onCancel: options.close,
        cancelLabel: "Close",
      }),
    );
    return;
  }
  if (!options.queriesKnown) throw new Error(FAVORITES_AVAILABILITY_TEXT.queriesUnknown);
  const projects = [...new Map(options.projects.map((project) => [project.id, project])).values()];
  const missing = projects.filter((project) => project.url === null);
  const links = projects.flatMap((project) =>
    project.url === null ? [] : [{ title: project.title, url: project.url }],
  );
  links.push(options.catalog);
  options.logger.info(
    `Favorites sync for query ${options.queryId}: ${projects.length} filtered project(s), ${missing.length} without queries.`,
  );
  confirmSync(panel, options, status, links, missing);
}

function confirmSync(
  panel: HTMLElement,
  options: ProjectsFavoritesOptions,
  status: CatalogFavoritesStatus,
  links: readonly FavoriteLink[],
  missing: readonly CatalogFavoriteProject[],
): void {
  const doc = panel.ownerDocument;
  const deleted = favoritesDeletedBySync(status.existing, links);
  const keepList = renderFavoritesKeepList(doc, deleted);
  const omitted =
    missing.length === 0
      ? ""
      : ` ${missing.length} project(s) have no query and are omitted: ${missing.map((project) => project.title).join(", ")}.`;
  const confirm = renderConfirmPanel(doc, {
    summary: `Sync replaces the favorites in "${status.path}" with ${links.length - 1} project Favorite(s) and the catalog link.`,
    detail: `Subfolders of "${status.path}" are not touched.${omitted}`,
    choices: [
      {
        label: "Sync",
        primary: true,
        onChoose: () => {
          const keep = keepList.selectedIds();
          options.logger.info(
            `Favorites sync for query ${options.queryId}: confirmed; ${deleted.length} favorite(s) offered for deletion, ${keep.length} kept, ${missing.length} project(s) omitted.`,
          );
          void sync(panel, options, status.path, links, keep).catch((error: unknown) =>
            showFailure(panel, options, error),
          );
        },
      },
    ],
    onCancel: () => cancel(options),
  });
  if (deleted.length > 0) confirm.insertBefore(keepList.element, confirm.lastElementChild);
  panel.replaceChildren(confirm);
}
async function sync(
  panel: HTMLElement,
  options: ProjectsFavoritesOptions,
  path: string,
  links: readonly FavoriteLink[],
  keep: readonly string[],
): Promise<void> {
  panel.textContent = "Syncing projects to Favorites...";
  const result = await options.favorites.sync(options.queryId, path, links, keep);
  options.logger.info(
    `Favorites sync for query ${options.queryId}: saved ${links.length - 1} project link(s) and the catalog link.`,
  );
  renderCompletion(panel, options, result, path, links.length - 1);
}

function renderCompletion(
  panel: HTMLElement,
  options: ProjectsFavoritesOptions,
  result: CatalogFavoritesSyncResult,
  path: string,
  projectCount: number,
): void {
  panel.replaceChildren(
    renderRemovedFavoritesList(panel.ownerDocument, {
      summary: `Synced ${projectCount} project Favorite(s) and the catalog link to "${path}".`,
      removed: result.removed,
      restore: (ids) => options.favorites.restore(options.queryId, result.syncId, ids),
      logger: options.logger,
      close: options.close,
    }),
  );
}

function cancel(options: ProjectsFavoritesOptions): void {
  options.logger.info(`Favorites sync for query ${options.queryId}: cancelled without changes.`);
  options.close();
}

function showFailure(panel: HTMLElement, options: ProjectsFavoritesOptions, error: unknown): void {
  options.logger.error("Could not sync projects to Favorites", error);
  panel.setAttribute("role", "alert");
  panel.textContent = `Could not sync Favorites: ${error instanceof Error ? error.message : String(error)}`;
}
