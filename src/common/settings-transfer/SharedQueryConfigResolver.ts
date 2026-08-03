import type { QueryBindings } from "../bindings/QueryBinding";
import type { ILogger } from "../logging/ILogger";
import type { ExtensionSettings } from "../settings/ExtensionSettings";

import { importConfig } from "./AwesomeAdoConfig";
import type { TeamConfigReader } from "./TeamConfigSynchronizer";

/** One configuration work item's published content, as the queries linked to it consume it. */
export interface SharedQueryConfig {
  workItemId: number;
  /** Only the settings the payload carried usably; the rest stay whatever the reader has. */
  settings: Partial<ExtensionSettings>;
  /** Every enhanced query the payload describes, so a linked query can find its own. */
  bindings: QueryBindings;
  /** The team the payload names, or null when it names none. */
  teamId: string | null;
}

/**
 * Reads shared configuration work items, at most once each per resolver.
 *
 * The memoization is the point, not an optimization detail: several queries in one team can be
 * shared from the SAME work item, and re-reading it once per query would multiply a credentialed
 * round trip by the number of links for an answer that cannot differ. A failed read is remembered
 * too, so a work item that cannot be reached is asked about once rather than once per query;
 * `invalidate` is how an explicit refresh gets a fresh answer.
 */
export class SharedQueryConfigResolver {
  private readonly reads = new Map<number, Promise<SharedQueryConfig | null>>();

  constructor(
    private readonly reader: TeamConfigReader,
    private readonly logger: ILogger,
  ) {}

  resolve(workItemId: number): Promise<SharedQueryConfig | null> {
    let read = this.reads.get(workItemId);
    if (read === undefined) {
      read = this.performRead(workItemId);
      this.reads.set(workItemId, read);
    }
    return read;
  }

  /** Forget every remembered read, so the next resolve asks Azure DevOps again. */
  invalidate(): void {
    this.reads.clear();
  }

  private async performRead(workItemId: number): Promise<SharedQueryConfig | null> {
    try {
      const response = await this.reader.read(workItemId);
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (response.text === null) {
        this.logger.info(
          `Shared configuration work item ${workItemId} holds no published configuration yet.`,
        );
        return null;
      }
      const imported = importConfig(response.text);
      if (!imported.replacesBindings) {
        // A connection-only payload points at a source; it never IS one, so a query linked to it
        // would end up with no binding at all rather than the team's.
        throw new Error("it does not hold a complete AwesomeADO configuration");
      }
      const bindingCount = Object.keys(imported.enhancedQueries).length;
      this.logger.info(
        `Read shared configuration work item ${workItemId}: ${bindingCount} binding(s), ` +
          `${imported.problems.length} problem(s).`,
      );
      return {
        workItemId,
        settings: imported.settings,
        bindings: imported.enhancedQueries,
        teamId: imported.settings.currentTeam?.id ?? null,
      };
    } catch (error) {
      this.logger.error(`Could not read shared configuration work item ${workItemId}`, error);
      return null;
    }
  }
}
