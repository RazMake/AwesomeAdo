import { favoritesPathSegments } from "../browser/Favorites";

import type { ISettingsStore } from "./ISettingsStore";

export interface QueryFavoritesPaths {
  read(queryId: string): Promise<string>;
  write(queryId: string, path: string): Promise<void>;
}

export function normalizeQueryFavoritesPaths(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export class PersonalQueryFavoritesPaths implements QueryFavoritesPaths {
  constructor(private readonly settings: ISettingsStore) {}

  async read(queryId: string): Promise<string> {
    const paths = (await this.settings.read()).queryFavoritesPaths;
    return Object.hasOwn(paths, queryId) ? (paths[queryId] ?? "") : "";
  }

  async write(queryId: string, path: string): Promise<void> {
    const normalized = path.trim() === "" ? "" : favoritesPathSegments(path).join("/");
    const paths = { ...(await this.settings.read()).queryFavoritesPaths };
    if (normalized === "") delete paths[queryId];
    else Object.defineProperty(paths, queryId, { value: normalized, enumerable: true });
    await this.settings.write({ queryFavoritesPaths: paths });
  }
}
