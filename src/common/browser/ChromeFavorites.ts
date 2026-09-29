import type { ILogger } from "../logging/ILogger";

import {
  FAVORITES_REFUSALS,
  favoritesPathSegments,
  favoritesReadFailed,
  normalizeFavoritesFolderPath,
  type ExistingFavorite,
  type FavoriteLink,
  type Favorites,
  type FavoritesReplacement,
  type FavoritesRestoreOutcome,
  type RemovedFavorite,
} from "./Favorites";

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;
type BookmarksApi = typeof chrome.bookmarks;

class FavoritesRefusal extends Error {}

function bookmarksApi(): BookmarksApi {
  if (typeof chrome === "undefined" || chrome.bookmarks === undefined) {
    throw new FavoritesRefusal(FAVORITES_REFUSALS.noAccess);
  }
  return chrome.bookmarks;
}

function favoritesBar(tree: BookmarkNode[]): BookmarkNode {
  const candidates = tree
    .flatMap((root) => root.children ?? [])
    .filter((node) => node.folderType === "bookmarks-bar" || node.id === "1");
  if (candidates.length !== 1 || candidates[0] === undefined || candidates[0].unmodifiable) {
    throw new FavoritesRefusal(FAVORITES_REFUSALS.noBar);
  }
  return candidates[0];
}

function replaceableLinks(folder: BookmarkNode): BookmarkNode[] {
  const links = (folder.children ?? []).filter((child) => child.url !== undefined);
  if (links.some((link) => link.unmodifiable)) {
    throw new FavoritesRefusal(FAVORITES_REFUSALS.managedEntries);
  }
  return links;
}

function subfolderCount(folder: BookmarkNode): number {
  return (folder.children ?? []).filter((child) => child.url === undefined).length;
}

function removedNotRecreated(
  removed: readonly BookmarkNode[],
  created: readonly FavoriteLink[],
): RemovedFavorite[] {
  const replacements = new Map<string, number>();
  for (const link of created) {
    const key = JSON.stringify([link.title, link.url]);
    replacements.set(key, (replacements.get(key) ?? 0) + 1);
  }
  return removed.flatMap((link) => {
    const key = JSON.stringify([link.title, link.url]);
    const matches = replacements.get(key) ?? 0;
    if (matches > 0) {
      replacements.set(key, matches - 1);
      return [];
    }
    return [{ id: link.id, title: link.title, url: link.url ?? "" }];
  });
}

function collectFolderPaths(node: BookmarkNode, prefix = ""): string[] {
  return (node.children ?? []).flatMap((child) => {
    if (child.url !== undefined || child.unmodifiable || /[\\/]/.test(child.title)) return [];
    const path = prefix === "" ? child.title : `${prefix}/${child.title}`;
    if (child.title.trim() !== child.title || ["", ".", ".."].includes(child.title)) return [];
    return [path, ...collectFolderPaths(child, path)];
  });
}

export function validateFavoriteLinks(links: readonly FavoriteLink[]): void {
  for (const link of links) {
    const url = new URL(link.url);
    if (!["https:", "http:"].includes(url.protocol) || link.title.trim() === "") {
      throw new Error("Favorites must have a name and an HTTP or HTTPS URL.");
    }
  }
}

export class ChromeFavorites implements Favorites {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly logger: ILogger) {}

  async folderPaths(): Promise<readonly string[]> {
    const bookmarks = bookmarksApi();
    return collectFolderPaths(favoritesBar(await bookmarks.getTree()));
  }

  async inspect(path: string): Promise<string | null> {
    if (normalizeFavoritesFolderPath(path) === null) return FAVORITES_REFUSALS.invalidPath;
    try {
      const folder = await this.destination(favoritesPathSegments(path), false);
      if (folder !== null) replaceableLinks(folder);
      return null;
    } catch (error) {
      if (error instanceof FavoritesRefusal) return error.message;
      this.logger.error("Could not inspect catalog Favorites", error);
      return favoritesReadFailed(error);
    }
  }

  async existing(path: string): Promise<readonly ExistingFavorite[]> {
    const folder = await this.destination(favoritesPathSegments(path), false);
    return (folder?.children ?? []).flatMap((child) =>
      child.url === undefined ? [] : [{ id: child.id, title: child.title, url: child.url }],
    );
  }

  replace(
    path: string,
    links: readonly FavoriteLink[],
    keep: readonly string[] = [],
  ): Promise<FavoritesReplacement> {
    return this.serialize(() => this.replaceContents(path, links, new Set(keep)));
  }

  restore(
    folderId: string,
    favorites: readonly RemovedFavorite[],
  ): Promise<FavoritesRestoreOutcome> {
    return this.serialize(() => this.restoreFavorites(folderId, favorites));
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.pending.then(operation);
    this.pending = task.then(
      () => undefined,
      (error: unknown) => {
        this.logger.error("Could not complete catalog Favorites operation", error);
      },
    );
    return task;
  }

  private async destination(
    segments: readonly string[],
    createMissing: boolean,
  ): Promise<BookmarkNode | null> {
    const bookmarks = bookmarksApi();
    const bar = favoritesBar(await bookmarks.getTree());
    let parent = bar;
    for (const title of segments) {
      const matches = (parent.children ?? []).filter(
        (node) => node.url === undefined && node.title === title,
      );
      if (matches.length > 1) throw new FavoritesRefusal(FAVORITES_REFUSALS.duplicateFolders);
      if (matches[0] === undefined && !createMissing) return null;
      parent = matches[0] ?? (await bookmarks.create({ parentId: parent.id, title }));
      if (parent.unmodifiable) throw new FavoritesRefusal(FAVORITES_REFUSALS.managedFolder);
    }
    if (parent.id === bar.id) throw new FavoritesRefusal(FAVORITES_REFUSALS.invalidPath);
    return parent;
  }

  private async replaceContents(
    path: string,
    links: readonly FavoriteLink[],
    keep: ReadonlySet<string>,
  ): Promise<FavoritesReplacement> {
    const segments = favoritesPathSegments(path);
    validateFavoriteLinks(links);
    const folder = await this.destination(segments, true);
    if (folder === null) throw new FavoritesRefusal(FAVORITES_REFUSALS.invalidPath);
    const previousLinks = replaceableLinks(folder).filter((link) => !keep.has(link.id));
    const bookmarks = bookmarksApi();
    // Writing first ensures a failed sync cannot empty a user's destination.
    for (const link of links) {
      await bookmarks.create({ parentId: folder.id, title: link.title, url: link.url });
    }
    const removed = await this.removeOldLinks(bookmarks, previousLinks);
    const missing = removedNotRecreated(removed, links);
    this.logger.info(
      `Synced catalog Favorites: linksWritten=${links.length}; oldLinksRemoved=${removed.length}; removedNotRecreated=${missing.length}; subfoldersKept=${subfolderCount(folder)}; userKept=${keep.size}; removalFailures=${previousLinks.length - removed.length}.`,
    );
    return { folderId: folder.id, removed: missing };
  }

  private async removeOldLinks(
    bookmarks: BookmarksApi,
    previousLinks: readonly BookmarkNode[],
  ): Promise<BookmarkNode[]> {
    const removed: BookmarkNode[] = [];
    for (const link of previousLinks) {
      try {
        // `remove` cannot recursively delete a folder if this list ever changes shape.
        await bookmarks.remove(link.id);
        removed.push(link);
      } catch (error) {
        this.logger.error(`Could not remove catalog Favorite id=${link.id}`, error);
      }
    }
    return removed;
  }

  private async restoreFavorites(
    folderId: string,
    favorites: readonly RemovedFavorite[],
  ): Promise<FavoritesRestoreOutcome> {
    const bookmarks = bookmarksApi();
    const folder = await this.restoreFolder(bookmarks, folderId);
    if (folder.unmodifiable) throw new FavoritesRefusal(FAVORITES_REFUSALS.managedFolder);
    const outcome = await this.createRestoredLinks(bookmarks, folderId, favorites);
    this.logger.info(
      `Restored catalog Favorites: restored=${outcome.restored.length}; failed=${outcome.failed.length}.`,
    );
    return outcome;
  }

  private async restoreFolder(bookmarks: BookmarksApi, folderId: string): Promise<BookmarkNode> {
    try {
      const folder = (await bookmarks.get(folderId))[0];
      if (folder === undefined || folder.url !== undefined) {
        throw new FavoritesRefusal(FAVORITES_REFUSALS.folderGone);
      }
      return folder;
    } catch (error) {
      if (error instanceof FavoritesRefusal) throw error;
      this.logger.error("Could not find Favorites folder for restore", error);
      throw new FavoritesRefusal(FAVORITES_REFUSALS.folderGone);
    }
  }

  private async createRestoredLinks(
    bookmarks: BookmarksApi,
    folderId: string,
    favorites: readonly RemovedFavorite[],
  ): Promise<FavoritesRestoreOutcome> {
    const restored: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const favorite of favorites) {
      try {
        await bookmarks.create({ parentId: folderId, title: favorite.title, url: favorite.url });
        restored.push(favorite.id);
      } catch (error) {
        this.logger.error(`Could not restore catalog Favorite id=${favorite.id}`, error);
        failed.push({ id: favorite.id, error: this.errorMessage(error) });
      }
    }
    return { restored, failed };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
