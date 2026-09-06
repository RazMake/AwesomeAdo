export interface FavoriteLink {
  title: string;
  url: string;
}

export interface Favorites {
  folderPaths(): Promise<readonly string[]>;
  replace(path: string, links: readonly FavoriteLink[]): Promise<void>;
}

export interface CatalogFavorites {
  readPath(queryId: string): Promise<string>;
  sync(queryId: string, path: string, links: readonly FavoriteLink[]): Promise<void>;
  openSettings(queryId: string): void;
}

export function favoritesPathSegments(path: string): string[] {
  const segments = path
    .trim()
    .split(/[\\/]/)
    .map((segment) => segment.trim());
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Choose a folder path beneath Favorites bar, such as Work/Projects.");
  }
  return segments;
}
