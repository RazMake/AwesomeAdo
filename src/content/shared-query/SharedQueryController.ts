import type { QueryBinding } from "../../common/bindings/QueryBinding";
import type { ILogger } from "../../common/logging/ILogger";
import { parseAdoQueryId } from "../../common/navigation/AdoQueryRoute";
import { parseSharedConfigWorkItemId } from "../../common/navigation/SharedQueryLink";
import type { ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { SharedQueryConfigResolver } from "../../common/settings-transfer/SharedQueryConfigResolver";
import type { SharedQueryLinkService } from "../../common/settings-transfer/SharedQueryLinkService";
import type { SharedQuerySourceStore } from "../../common/settings-transfer/SharedQuerySourceStore";

/** The configuration one read-only shared query is rendered with, or null when it is not one. */
export interface SharedQueryConfiguration {
  queryId: string;
  workItemId: number;
  /** The publisher's settings, which govern this query's page instead of the reader's own. */
  settings: Partial<ExtensionSettings>;
  /** The publisher's binding for this query, or null when they do not enhance it. */
  binding: QueryBinding | null;
}

type OnConfiguration = (configuration: SharedQueryConfiguration | null) => void;

/**
 * Applies a shared query link on the page it arrived on, and reports the configuration the current
 * query must be rendered with.
 *
 * It is re-run on every SPA navigation because the answer is per query, not per tab: leaving a
 * linked query behind must take the publisher's settings with it, or the reader would keep seeing
 * someone else's configuration on their own queries.
 */
export class SharedQueryController {
  private readOnlyQuery: string | null = null;

  constructor(
    private readonly linkService: SharedQueryLinkService,
    private readonly sources: SharedQuerySourceStore,
    private readonly resolver: SharedQueryConfigResolver,
    private readonly onConfiguration: OnConfiguration,
    private readonly logger: ILogger,
  ) {}

  /** Whether this query is rendered from a shared work item the reader may not change. */
  isReadOnly(queryId: string): boolean {
    return this.readOnlyQuery === queryId;
  }

  /** Stop reading this query's configuration from a shared work item. */
  async release(queryId: string): Promise<void> {
    await this.sources.unlink(queryId);
    if (this.readOnlyQuery === queryId) {
      this.readOnlyQuery = null;
      this.onConfiguration(null);
    }
  }

  async navigate(url: string): Promise<void> {
    const queryId = parseAdoQueryId(url);
    if (queryId === null) {
      this.report(null);
      return;
    }
    const linked = parseSharedConfigWorkItemId(url);
    if (linked !== null) {
      const outcome = await this.linkService.apply(queryId, linked);
      if (outcome.status === "failed") {
        this.logger.error(`Shared query link on ${queryId} was not applied: ${outcome.error}`);
      }
    }
    const workItemId = (await this.sources.read())[queryId];
    if (workItemId === undefined) {
      this.report(null);
      return;
    }
    const config = await this.resolver.resolve(workItemId);
    if (config === null) {
      // The link survives a failed read: the item may simply be unreachable right now, and dropping
      // the link here would silently turn a shared query into an unenhanced one for good.
      this.logger.error(
        `Query ${queryId} is shared from work item ${workItemId}, which could not be read.`,
      );
      this.report(null);
      return;
    }
    this.report({
      queryId,
      workItemId,
      settings: config.settings,
      binding: config.bindings[queryId] ?? null,
    });
  }

  private report(configuration: SharedQueryConfiguration | null): void {
    this.readOnlyQuery = configuration?.queryId ?? null;
    this.onConfiguration(configuration);
  }
}
