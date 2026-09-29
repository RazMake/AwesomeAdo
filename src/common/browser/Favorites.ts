export interface FavoriteLink {
  title: string;
  url: string;
}

/** `id` is the bookmark's id — only a selection key for keep/restore choices. */
export interface ExistingFavorite extends FavoriteLink {
  id: string;
}

export type RemovedFavorite = ExistingFavorite;

export interface FavoritesReplacement {
  folderId: string;
  removed: readonly RemovedFavorite[];
}

export interface FavoritesRestoreOutcome {
  restored: readonly string[];
  failed: readonly { id: string; error: string }[];
}

export interface CatalogFavoritesStatus {
  /** Normalized configured folder; empty when none is configured. */
  path: string;
  /** Why syncing cannot run now, or null when the destination is safe. */
  refusal: string | null;
  /** Links directly inside the folder (never subfolders); empty when refused or missing. */
  existing: readonly ExistingFavorite[];
}

export interface CatalogFavoritesSyncResult {
  syncId: string;
  removed: readonly RemovedFavorite[];
}

export interface Favorites {
  folderPaths(): Promise<readonly string[]>;
  /** Why the destination cannot be replaced now, or null (a folder that does not exist yet is fine). */
  inspect(path: string): Promise<string | null>;
  /** Links directly inside the folder; empty when it does not exist yet. */
  existing(path: string): Promise<readonly ExistingFavorite[]>;
  /** `keep` lists existing favorite ids the user chose to leave in place. */
  replace(
    path: string,
    links: readonly FavoriteLink[],
    keep?: readonly string[],
  ): Promise<FavoritesReplacement>;
  restore(
    folderId: string,
    favorites: readonly RemovedFavorite[],
  ): Promise<FavoritesRestoreOutcome>;
}

export interface CatalogFavorites {
  status(queryId: string): Promise<CatalogFavoritesStatus>;
  sync(
    queryId: string,
    path: string,
    links: readonly FavoriteLink[],
    keep: readonly string[],
  ): Promise<CatalogFavoritesSyncResult>;
  restore(
    queryId: string,
    syncId: string,
    ids: readonly string[],
  ): Promise<FavoritesRestoreOutcome>;
  openSettings(queryId: string): void;
}

export const FAVORITES_REFUSALS = {
  invalidPath:
    "Choose a folder inside Favorites bar, such as Work/Projects. The Favorites bar itself can't be used.",
  noFolder:
    "No Favorites folder is set for this catalog. Set one in AwesomeADO Options → Query Bindings.",
  noAccess:
    "AwesomeADO isn't allowed to change your Favorites yet. Allow it in AwesomeADO Options → Query Bindings.",
  noBar: "Could not identify a unique writable Favorites bar.",
  duplicateFolders:
    "The Favorites folder path matches more than one folder. Rename one of them or choose another path.",
  managedFolder:
    "The Favorites folder is managed by your browser or organization and can't be changed.",
  managedEntries: "The Favorites folder contains managed favorites that can't be replaced.",
  folderGone: "The Favorites folder no longer exists, so nothing was restored.",
  pathChanged: "The Favorites folder changed. Reopen Sync projects to Favorites and try again.",
  restoreGone:
    "These favorites can no longer be restored because a newer sync or a browser restart replaced the list.",
  restoreUnknown: "Some selected favorites are no longer available to restore.",
} as const;

/**
 * The bar root is never a destination: replacing it would erase unrelated user favorites.
 */
export function normalizeFavoritesFolderPath(path: string): string | null {
  const trimmed = path.trim();
  if (trimmed === "") return null;
  const segments = trimmed.split(/[\\/]/).map((segment) => segment.trim());
  return segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ? null
    : segments.join("/");
}

export function favoritesPathSegments(path: string): string[] {
  const normalized = normalizeFavoritesFolderPath(path);
  if (normalized === null) throw new Error(FAVORITES_REFUSALS.invalidPath);
  return normalized.split("/");
}

export function favoritesReadFailed(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Could not read your Favorites: ${message}`;
}
