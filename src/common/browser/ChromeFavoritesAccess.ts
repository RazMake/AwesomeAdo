import type { FavoritesAccess } from "./FavoritesAccess";

const FAVORITES_PERMISSION: chrome.permissions.Permissions = {
  permissions: ["bookmarks"],
};

/** FavoritesAccess backed by Chromium's optional permissions API. */
export class ChromeFavoritesAccess implements FavoritesAccess {
  isGranted(): Promise<boolean> {
    return chrome.permissions.contains(FAVORITES_PERMISSION);
  }

  request(): Promise<boolean> {
    // Chromium requires the permission API call during the originating user gesture.
    return chrome.permissions.request(FAVORITES_PERMISSION);
  }
}
