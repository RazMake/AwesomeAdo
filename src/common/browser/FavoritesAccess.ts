/**
 * Controls the optional permission that allows Favorites changes.
 *
 * Favorites access is optional so installing AwesomeADO never grants power over the user's
 * Favorites.
 */
export interface FavoritesAccess {
  isGranted(): Promise<boolean>;

  /**
   * Requests Favorites access.
   *
   * Call this directly from an extension-page user gesture, such as a change or click handler,
   * because Chromium rejects permission requests outside one.
   */
  request(): Promise<boolean>;
}
