import {
  parseTeamCapacity,
  type SprintCapacityResult,
  type TeamCapacityLoader,
} from "../ado/TeamCapacity";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_SPRINT_CAPACITY_MESSAGE,
  type LoadSprintCapacityMessage,
  type LoadSprintCapacityResponse,
} from "./AdoCapacityRequest";

export type SendCapacityRequest = (
  message: LoadSprintCapacityMessage,
) => Promise<LoadSprintCapacityResponse | undefined>;

/** Loads and normalizes a sprint roster through the background worker's closed capacity operation. */
export class MessagingTeamCapacityLoader implements TeamCapacityLoader {
  constructor(
    private readonly send: SendCapacityRequest,
    private readonly logger: ILogger,
  ) {}

  async loadCapacity(team: string, iterationId: string): Promise<SprintCapacityResult> {
    try {
      const response = await this.send({
        type: LOAD_SPRINT_CAPACITY_MESSAGE,
        team,
        iterationId,
      });
      if (response === undefined || response.raw === null) {
        const status = response?.status ?? 0;
        const error = `Could not load sprint capacity (HTTP ${status}).`;
        this.logger.error(error);
        return { members: [], error };
      }
      const members = parseTeamCapacity(response.raw);
      this.logger.info(`Loaded ${members.length} sprint capacity member(s).`);
      return { members, error: null };
    } catch (error) {
      const message = "Could not load sprint capacity.";
      this.logger.error(message, error);
      return { members: [], error: message };
    }
  }
}
