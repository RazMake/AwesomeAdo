import type { ILogger } from "../../../common/logging/ILogger";
import type {
  RefreshButtonHandle,
  RefreshRequest,
} from "../../../common/view-common/control/HeaderButtons/HeaderButtons";

/** What a board hands the loader: how to read its data, and how to show each outcome. */
export interface BoardLoaderOptions<T> {
  /** Read one answer from Azure DevOps; a rejection is a failed load. */
  fetch(): Promise<T>;
  /** Paint the board from `data()`, including the retained board after a failed refresh. */
  paint(): void;
  /** Replace the surface with a placeholder line (loading, or a first load that failed). */
  showMessage(message: string): void;
  /** Shown while the first load is in flight. */
  loadingMessage: string;
  /** Logged, with the thrown value, whenever a load fails. */
  failureLogMessage: string;
  logger: ILogger;
  openDiagnosticsLog(): void;
  /** The board's write queue, whose failure report is cleared by every fresh read. */
  queue: { clearFailures(): void };
  /** The refresh button currently on screen, or null before the first paint. */
  refreshButton(): RefreshButtonHandle | null;
  /** Forget everything the board remembers between reads; run before a Ctrl+Refresh re-read. */
  discardCaches?(): void;
}

/** A board's load/refresh lifecycle. */
export interface BoardLoader<T> {
  /** The answer on screen, or null until the first load lands. */
  data(): T | null;
  /** Read the query; a refresh keeps the current board on screen while it runs. */
  load(isRefresh: boolean): void;
  /**
   * What the header's Refresh press does: re-read, or open Diagnostics after a failed refresh. A
   * request to discard caches always discards and re-reads — the reader is forcing a fresh start.
   */
  refresh(request?: RefreshRequest): void;
  /** Whether the board on screen is older data a failed refresh left behind. */
  refreshFailed(): boolean;
}

/** Shown in place of a board whose very first load failed. */
const LOAD_FAILED_MESSAGE = "Could not load this query.";

/**
 * The load/refresh lifecycle every tree board shares.
 *
 * Only the newest load may paint: a slow answer overtaken by a later refresh would otherwise
 * replace the fresher board with an older one. A refresh that fails keeps the truthful-if-older
 * board and marks the button, and the next press opens the Diagnostics log where the cause was
 * recorded rather than silently retrying the thing that just failed.
 */
export function createBoardLoader<T>(options: BoardLoaderOptions<T>): BoardLoader<T> {
  let data: T | null = null;
  let generation = 0;
  let failed = false;

  const load = (isRefresh: boolean): void => {
    const current = ++generation;
    // What the board is about to show comes from Azure DevOps, so a report about an edit that never
    // landed has nothing left to warn about.
    options.queue.clearFailures();
    if (!isRefresh) options.showMessage(options.loadingMessage);
    options.refreshButton()?.setBusy(true);
    void options
      .fetch()
      .then((loaded) => {
        if (current !== generation) return;
        failed = false;
        data = loaded;
        options.paint();
      })
      .catch((error: unknown) => {
        if (current !== generation) return;
        options.logger.error(options.failureLogMessage, error);
        if (isRefresh && data !== null) {
          failed = true;
          options.paint();
          return;
        }
        options.showMessage(LOAD_FAILED_MESSAGE);
      });
  };

  return {
    data: () => data,
    load,
    refresh: (request) => {
      if (request?.discardCaches === true) {
        options.discardCaches?.();
        load(true);
        return;
      }
      if (failed) {
        failed = false;
        options.openDiagnosticsLog();
        options.paint();
        return;
      }
      load(true);
    },
    refreshFailed: () => failed,
  };
}
