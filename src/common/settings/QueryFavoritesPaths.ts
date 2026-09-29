import { FAVORITES_REFUSALS, normalizeFavoritesFolderPath } from "../browser/Favorites";

import type { ISettingsStore } from "./ISettingsStore";

export interface QueryFavoritesPaths {
  read(queryId: string): Promise<string>;
  write(queryId: string, path: string): Promise<void>;
}

export function normalizeQueryFavoritesPaths(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([queryId, path]) => {
      const normalized = typeof path === "string" ? normalizeFavoritesFolderPath(path) : null;
      return normalized === null ? [] : [[queryId, normalized]];
    }),
  );
}

export class PersonalQueryFavoritesPaths implements QueryFavoritesPaths {
  constructor(private readonly settings: ISettingsStore) {}

  async read(queryId: string): Promise<string> {
    const paths = (await this.settings.read()).queryFavoritesPaths;
    return Object.hasOwn(paths, queryId) ? (paths[queryId] ?? "") : "";
  }

  async write(queryId: string, path: string): Promise<void> {
    const isBlank = path.trim() === "";
    const normalized = normalizeFavoritesFolderPath(path);
    if (!isBlank && normalized === null) throw new Error(FAVORITES_REFUSALS.invalidPath);
    const paths = { ...(await this.settings.read()).queryFavoritesPaths };
    if (isBlank) delete paths[queryId];
    else Object.defineProperty(paths, queryId, { value: normalized, enumerable: true });
    await this.settings.write({ queryFavoritesPaths: paths });
  }
}
