import type { ITeamIterationsLoader } from "../ado/ITeamIterationsLoader";
import { parseTeamIterations, type TeamIteration } from "../ado/TeamIteration";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_TEAM_ITERATIONS_MESSAGE,
  type LoadTeamIterationsMessage,
  type LoadTeamIterationsResponse,
} from "./AdoIterationsRequest";

/** Sends a load-team-iterations request and resolves the background worker's reply, if any. */
export type SendIterationsRequest = (
  message: LoadTeamIterationsMessage,
) => Promise<LoadTeamIterationsResponse | undefined>;

/**
 * Loads a team's iterations by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `AdoIterationsRequest`'s doc comment), so this loader hands the team name to the worker and parses
 * whatever raw body comes back. The `send` function is injected so this class never touches
 * `chrome.runtime` itself (Dependency Inversion) — the composition root supplies the real
 * `chrome.runtime.sendMessage` binding, and a test supplies a fake. A failure degrades to an empty
 * list (logged) so the sprint picker simply shows nothing rather than breaking the view.
 */
export class MessagingTeamIterationsLoader implements ITeamIterationsLoader {
  constructor(
    private readonly send: SendIterationsRequest,
    private readonly logger: ILogger,
  ) {}

  async loadIterations(team: string): Promise<TeamIteration[]> {
    try {
      const response = await this.send({ type: LOAD_TEAM_ITERATIONS_MESSAGE, team });
      if (response === undefined || response === null || response.raw === null) {
        this.logger.error(`Could not load iterations for team "${team}": no data returned.`);
        return [];
      }
      const iterations = parseTeamIterations(response.raw);
      this.logger.info(`Loaded ${iterations.length} iteration(s) for team "${team}".`);
      return iterations;
    } catch (error) {
      this.logger.error(`Could not load iterations for team "${team}"`, error);
      return [];
    }
  }
}
