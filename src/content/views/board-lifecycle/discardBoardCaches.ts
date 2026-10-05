import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

/** Anything a board remembers between reads that a Ctrl+Refresh must forget. */
export interface BoardCache {
  clear(): void;
}

/**
 * Forget what this board AND the page's shared services remember, ahead of a Ctrl+Refresh re-read.
 *
 * An ordinary Refresh re-reads only the query, keeping answers that are expensive to ask again
 * (opened discussions, discussion dates, directory lookups). A Ctrl+Refresh is the reader saying
 * they no longer trust any of those, so every board clears through this one place, and the log
 * records which board asked and how much it threw away.
 */
export function discardBoardCaches(
  services: Pick<EnhancedViewServices, "discardCachedData" | "logger">,
  board: string,
  caches: readonly BoardCache[],
): void {
  services.logger.info(
    `${board} Ctrl+Refresh: discarding ${caches.length} board cache(s) and the page's remembered ` +
      "Azure DevOps answers before re-reading.",
  );
  for (const cache of caches) cache.clear();
  services.discardCachedData?.();
}
