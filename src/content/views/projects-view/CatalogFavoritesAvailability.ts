import type { CatalogFavorites, CatalogFavoritesStatus } from "../../../common/browser/Favorites";
import type { ILogger } from "../../../common/logging/ILogger";

export const FAVORITES_AVAILABILITY_TEXT = {
  unavailable: "Favorites are unavailable in this view.",
  checking: "Checking the Favorites setup…",
  checkFailed: "Could not check the Favorites setup. Reload the page and try again.",
  queriesUnknown: "Could not read project queries. Refresh the catalog before syncing Favorites.",
} as const;

/** Keeps the title command honest while the worker assesses its potentially destructive action. */
export class CatalogFavoritesAvailability {
  private status: CatalogFavoritesStatus | null = null;
  private checkFailed = false;
  private refreshVersion = 0;
  private lastLoggedReason: string | null | undefined;

  public constructor(
    private readonly favorites: CatalogFavorites,
    private readonly queryId: string,
    private readonly logger: ILogger,
  ) {}

  public refresh(): void {
    const version = ++this.refreshVersion;
    void this.readStatus(version);
  }

  public update(status: CatalogFavoritesStatus): void {
    ++this.refreshVersion;
    this.status = status;
    this.checkFailed = false;
  }

  public disabledReason(queryLinksKnown: boolean): string | null {
    const reason = this.currentReason(queryLinksKnown);
    if (reason !== this.lastLoggedReason) {
      this.logger.info(
        `Sync projects to Favorites for query ${this.queryId}: ${
          reason === null ? "enabled." : `disabled — ${reason}`
        }`,
      );
      this.lastLoggedReason = reason;
    }
    return reason;
  }

  private async readStatus(version: number): Promise<void> {
    try {
      const status = await this.favorites.status(this.queryId);
      if (version !== this.refreshVersion) return;
      this.status = status;
      this.checkFailed = false;
    } catch (error: unknown) {
      this.logger.error("Could not check the Favorites setup", error);
      if (version !== this.refreshVersion) return;
      this.checkFailed = true;
    }
  }

  private currentReason(queryLinksKnown: boolean): string | null {
    if (this.status === null && !this.checkFailed) return FAVORITES_AVAILABILITY_TEXT.checking;
    if (this.checkFailed) return FAVORITES_AVAILABILITY_TEXT.checkFailed;
    if (this.status?.refusal !== null) return this.status?.refusal ?? null;
    return queryLinksKnown ? null : FAVORITES_AVAILABILITY_TEXT.queriesUnknown;
  }
}
