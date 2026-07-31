import type {
  TeamConfigReader,
  TeamConfigReadResult,
} from "../settings-transfer/TeamConfigSynchronizer";

import {
  isReadTeamConfigResponse,
  READ_TEAM_CONFIG_MESSAGE,
  type ReadTeamConfigMessage,
  type ReadTeamConfigResponse,
} from "./TeamConfigRequest";

export type SendTeamConfigRequest = (
  message: ReadTeamConfigMessage,
) => Promise<ReadTeamConfigResponse | undefined>;

/** Reads team configuration through the background worker from an ADO content script. */
export class MessagingTeamConfigReader implements TeamConfigReader {
  constructor(private readonly send: SendTeamConfigRequest) {}

  async read(workItemId: number): Promise<TeamConfigReadResult> {
    try {
      const response: unknown = await this.send({ type: READ_TEAM_CONFIG_MESSAGE, workItemId });
      return isReadTeamConfigResponse(response)
        ? response
        : { ok: false, error: "The background worker returned no valid response." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
