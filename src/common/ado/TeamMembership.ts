import type { ILogger } from "../logging/ILogger";

import type { TeamMembersLoader } from "./TeamMembers";
import type { ICurrentUserReader } from "./currentUser";

/**
 * Answers whether the signed-in person belongs to a specific Azure DevOps team.
 *
 * Abstract so callers depend on the question rather than on how it is answered (Dependency
 * Inversion). `null` means "could not be determined" and is deliberately distinct from `false`: a
 * caller that grants trust on membership must be able to tell an authoritative "no" apart from an
 * unread roster, and treat only the former as a decision.
 */
export interface ITeamMembershipReader {
  isCurrentUserInTeam(teamId: string): Promise<boolean | null>;
}

/**
 * Decides membership by looking for the signed-in identity in the team's own roster.
 *
 * Both halves are asked of Azure DevOps itself rather than inferred from local configuration,
 * because the whole point is to check a claim that arrived from outside this browser.
 */
export class TeamMembershipReader implements ITeamMembershipReader {
  constructor(
    private readonly members: TeamMembersLoader,
    private readonly currentUser: ICurrentUserReader,
    private readonly logger: ILogger,
  ) {}

  async isCurrentUserInTeam(teamId: string): Promise<boolean | null> {
    if (teamId.trim().length === 0) {
      this.logger.info("Team membership undetermined: no team was named.");
      return null;
    }
    const [roster, user] = await Promise.all([
      this.members.loadMembers(teamId),
      this.currentUser.readCurrentUser(),
    ]);
    if (roster.error !== null || user === null) {
      // Either half missing makes the answer a guess. Say so; the caller decides what a guess costs.
      this.logger.info(
        `Team membership undetermined for team ${teamId}: ` +
          `roster=${roster.error ?? "ok"}, identity=${user === null ? "unknown" : "known"}.`,
      );
      return null;
    }
    const id = user.id?.toLowerCase() ?? null;
    const uniqueName = user.uniqueName?.toLowerCase() ?? null;
    const isMember = roster.members.some(
      (member) =>
        (id !== null && member.id.toLowerCase() === id) ||
        (uniqueName !== null && member.uniqueName?.toLowerCase() === uniqueName),
    );
    this.logger.info(
      `Team membership resolved for team ${teamId}: members=${roster.members.length}, ` +
        `isMember=${isMember}.`,
    );
    return isMember;
  }
}
