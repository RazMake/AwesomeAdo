import type { ITeamMembershipReader } from "../ado/TeamMembership";
import type { ILogger } from "../logging/ILogger";

import type { SharedQueryConfigResolver } from "./SharedQueryConfigResolver";
import type { SharedQuerySourceStore } from "./SharedQuerySourceStore";
import type { TeamConfigSourceStore } from "./TeamConfigSourceStore";

/** What arriving on a query URL that names a configuration work item ended up doing. */
export type SharedQueryLinkOutcome =
  /** The user is already connected to this exact work item; nothing about their setup changed. */
  | { status: "already-connected"; workItemId: number }
  /** The user belongs to the item's team, so it became their configuration source outright. */
  | { status: "connected"; workItemId: number }
  /** The user does not belong to that team, so only this one query reads from the item. */
  | { status: "linked"; workItemId: number; queryId: string }
  | { status: "failed"; workItemId: number; error: string };

/** Adopts the connection a shared query URL names, then pulls it. */
export type ConnectToTeamConfig = (workItemId: number) => Promise<void>;

/**
 * Decides what a shared query link may change, based on whether the recipient is in the item's team.
 *
 * The two outcomes are deliberately asymmetric. A **member** is a co-owner of that configuration, so
 * the work item simply becomes their source of truth exactly as if they had connected to it on the
 * options page. A **non-member** is a guest: the link buys them a read-only view of ONE query and
 * nothing else, so their own settings, their own bindings, and any team they do belong to are left
 * completely alone. Membership is checked against Azure DevOps' own roster rather than anything in
 * the link, and an undetermined answer takes the guest path — the narrow outcome is the safe one.
 */
export class SharedQueryLinkService {
  constructor(
    private readonly resolver: SharedQueryConfigResolver,
    private readonly teamConfigSource: TeamConfigSourceStore,
    private readonly sharedQuerySource: SharedQuerySourceStore,
    private readonly membership: ITeamMembershipReader,
    private readonly connect: ConnectToTeamConfig,
    private readonly logger: ILogger,
  ) {}

  async apply(queryId: string, workItemId: number): Promise<SharedQueryLinkOutcome> {
    try {
      if ((await this.teamConfigSource.read()) === workItemId) {
        return { status: "already-connected", workItemId };
      }
      const config = await this.resolver.resolve(workItemId);
      if (config === null) {
        return {
          status: "failed",
          workItemId,
          error: `work item ${workItemId} holds no readable AwesomeADO configuration`,
        };
      }
      const isMember =
        config.teamId === null ? null : await this.membership.isCurrentUserInTeam(config.teamId);
      this.logger.info(
        `Shared query ${queryId} names work item ${workItemId}: team=${config.teamId ?? "none"}, ` +
          `isMember=${isMember ?? "unknown"} -> ${isMember === true ? "connect" : "read-only link"}.`,
      );
      if (isMember === true) {
        await this.connect(workItemId);
        return { status: "connected", workItemId };
      }
      await this.sharedQuerySource.link(queryId, workItemId);
      return { status: "linked", workItemId, queryId };
    } catch (error) {
      this.logger.error(`Could not apply the shared link on query ${queryId}`, error);
      return { status: "failed", workItemId, error: describeError(error) };
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
