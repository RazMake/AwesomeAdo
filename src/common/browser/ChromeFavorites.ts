import type { ILogger } from "../logging/ILogger";

import { favoritesPathSegments, type FavoriteLink, type Favorites } from "./Favorites";

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

function favoritesBar(tree: BookmarkNode[]): BookmarkNode {
  const candidates = tree
    .flatMap((root) => root.children ?? [])
    .filter((node) => node.folderType === "bookmarks-bar" || node.id === "1");
  if (candidates.length !== 1 || candidates[0] === undefined || candidates[0].unmodifiable) {
    throw new Error("Could not identify a unique writable Favorites bar.");
  }
  return candidates[0];
}

function writableTree(node: BookmarkNode): boolean {
  return !node.unmodifiable && (node.children ?? []).every(writableTree);
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
    return collectFolderPaths(favoritesBar(await chrome.bookmarks.getTree()));
  }

  replace(path: string, links: readonly FavoriteLink[]): Promise<void> {
    const task = this.pending.then(() => this.replaceContents(path, links));
    this.pending = task.catch((error: unknown) => {
      this.logger.error("Could not replace catalog Favorites", error);
    });
    return task;
  }

  private async destination(segments: readonly string[]): Promise<BookmarkNode> {
    let parent = favoritesBar(await chrome.bookmarks.getTree());
    for (const title of segments) {
      const matches = (parent.children ?? []).filter(
        (node) => node.url === undefined && node.title === title,
      );
      if (matches.length > 1) throw new Error("The Favorites path matches duplicate folders.");
      parent = matches[0] ?? (await chrome.bookmarks.create({ parentId: parent.id, title }));
      if (parent.unmodifiable)
        throw new Error("The Favorites destination is managed and cannot be changed.");
    }
    return parent;
  }

  private async replaceContents(path: string, links: readonly FavoriteLink[]): Promise<void> {
    const segments = favoritesPathSegments(path);
    validateFavoriteLinks(links);
    const folder = await this.destination(segments);
    if (!writableTree(folder))
      throw new Error("The Favorites destination contains managed entries.");
    const previous = folder.children ?? [];
    for (const link of links) {
      await chrome.bookmarks.create({ parentId: folder.id, title: link.title, url: link.url });
    }
    for (const child of previous) {
      await chrome.bookmarks.removeTree(child.id);
    }
    this.logger.info(
      `Synced catalog Favorites: ${links.length} link(s); replaced ${previous.length} old entries.`,
    );
  }
}
