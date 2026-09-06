import type { CatalogFavorites, FavoriteLink } from "../../../common/browser/Favorites";
import type { ILogger } from "../../../common/logging/ILogger";
import { renderConfirmPanel } from "../../../common/view-common/control/ConfirmPanel/ConfirmPanel";

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
  panel.textContent = "Checking Favorites destination...";
  void prepare(panel, options).catch((error: unknown) => showFailure(panel, options, error));
  return panel;
}

async function prepare(panel: HTMLElement, options: ProjectsFavoritesOptions): Promise<void> {
  const path = await options.favorites.readPath(options.queryId);
  if (!panel.isConnected) return;
  if (path.trim() === "") {
    options.logger.info(
      `Favorites sync for query ${options.queryId}: no personal path; asking to configure it.`,
    );
    panel.replaceChildren(
      renderConfirmPanel(panel.ownerDocument, {
        summary: "No Favorites path is configured for this catalog.",
        choices: [
          {
            label: "Set",
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
        onCancel: () => cancel(options),
      }),
    );
    return;
  }
  if (!options.queriesKnown)
    throw new Error(
      "Could not read project queries. Refresh the catalog before syncing Favorites.",
    );
  const projects = [...new Map(options.projects.map((project) => [project.id, project])).values()];
  const missing = projects.filter((project) => project.url === null);
  const links = projects.flatMap((project) =>
    project.url === null ? [] : [{ title: project.title, url: project.url }],
  );
  links.push(options.catalog);
  options.logger.info(
    `Favorites sync for query ${options.queryId}: ${projects.length} filtered project(s), ${missing.length} without queries.`,
  );
  if (missing.length === 0) {
    await sync(panel, options, path, links);
    return;
  }
  panel.replaceChildren(
    renderConfirmPanel(panel.ownerDocument, {
      summary: `${missing.length} project(s) have no query: ${missing.map((project) => project.title).join(", ")}.`,
      detail: `Continue replaces all contents of "${path}" with ${links.length - 1} project Favorite(s) and the catalog link. Projects without queries are omitted.`,
      choices: [
        {
          label: "Continue",
          primary: true,
          onChoose: () => {
            options.logger.info(
              `Favorites sync for query ${options.queryId}: continuing without ${missing.length} project(s).`,
            );
            void sync(panel, options, path, links).catch((error: unknown) =>
              showFailure(panel, options, error),
            );
          },
        },
      ],
      onCancel: () => cancel(options),
    }),
  );
}

async function sync(
  panel: HTMLElement,
  options: ProjectsFavoritesOptions,
  path: string,
  links: readonly FavoriteLink[],
): Promise<void> {
  panel.textContent = "Syncing projects to Favorites...";
  await options.favorites.sync(options.queryId, path, links);
  options.logger.info(
    `Favorites sync for query ${options.queryId}: saved ${links.length - 1} project link(s) and the catalog link.`,
  );
  panel.textContent = `Synced ${links.length - 1} project Favorite(s) and the catalog link to "${path}".`;
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
