import {
  parseTeamMembers,
  type TeamMembersLoader,
  type TeamMembersResult,
} from "../ado/TeamMembers";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_TEAM_MEMBERS_MESSAGE,
  type LoadTeamMembersMessage,
  type LoadTeamMembersResponse,
} from "./AdoTeamMembersRequest";
import { workerReplyProblem } from "./workerReply";

export type SendTeamMembersRequest = (
  message: LoadTeamMembersMessage,
) => Promise<LoadTeamMembersResponse | undefined>;

/** Loads and normalizes the configured team's complete roster through the background worker. */
export class MessagingTeamMembersLoader implements TeamMembersLoader {
  constructor(
    private readonly send: SendTeamMembersRequest,
    private readonly logger: ILogger,
  ) {}

  async loadMembers(team: string): Promise<TeamMembersResult> {
    this.logger.info(`Team-members read requested for team ${team}.`);
    try {
      const response = await this.send({ type: LOAD_TEAM_MEMBERS_MESSAGE, team });
      if (response === undefined || response.raw === null) {
        const detail = workerReplyProblem(response);
        const error = `Could not load team members (${detail}).`;
        this.logger.error(error);
        return { members: [], error };
      }
      const members = parseTeamMembers(response.raw);
      this.logger.info(`Team-members read completed: members=${members.length}.`);
      return { members, error: null };
    } catch (error) {
      const message = "Could not load team members: request rejected.";
      this.logger.error(message, error);
      return { members: [], error: message };
    }
  }
}
