import type {
  TeamConfigWriter,
  TeamConfigWriteResult,
} from "../settings-transfer/TeamConfigSynchronizer";

import {
  isWriteTeamConfigResponse,
  WRITE_TEAM_CONFIG_MESSAGE,
  type WriteTeamConfigMessage,
  type WriteTeamConfigResponse,
} from "./TeamConfigRequest";

export type SendTeamConfigWriteRequest = (
  message: WriteTeamConfigMessage,
) => Promise<WriteTeamConfigResponse | undefined>;

/** Publishes team configuration through the content-to-background closed operation. */
export class MessagingTeamConfigWriter implements TeamConfigWriter {
  constructor(private readonly send: SendTeamConfigWriteRequest) {}

  async write(workItemId: number, text: string): Promise<TeamConfigWriteResult> {
    try {
      const response: unknown = await this.send({
        type: WRITE_TEAM_CONFIG_MESSAGE,
        workItemId,
        text,
      });
      return isWriteTeamConfigResponse(response)
        ? response
        : { ok: false, error: "The background worker returned no valid publish response." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
