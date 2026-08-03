import type { NoteAuthor } from "../ado/WorkItemNote";
import type { ICurrentUserReader } from "../ado/currentUser";
import { parseCurrentUser } from "../ado/currentUser";
import type { ILogger } from "../logging/ILogger";

import {
  READ_CURRENT_USER_MESSAGE,
  type ReadCurrentUserMessage,
  type ReadCurrentUserResponse,
} from "./CurrentUserRequest";
import { UNHANDLED_BY_WORKER } from "./workerReply";

export type SendCurrentUserRequest = (
  message: ReadCurrentUserMessage,
) => Promise<ReadCurrentUserResponse | undefined>;

/**
 * Reads the signed-in identity through the background worker.
 *
 * The isolated content world cannot reach the credentialed ADO REST API, so the worker runs the
 * request in the ADO tab's MAIN world and this adapter parses the raw body it returns.
 */
export class MessagingCurrentUserReader implements ICurrentUserReader {
  constructor(
    private readonly send: SendCurrentUserRequest,
    private readonly logger: ILogger,
  ) {}

  async readCurrentUser(): Promise<NoteAuthor | null> {
    try {
      const response = await this.send({ type: READ_CURRENT_USER_MESSAGE });
      // An unclaimed message and a failed read are indistinguishable to the caller but need opposite
      // fixes, so each says which one happened rather than both reading as "no identity".
      if (response === undefined) {
        this.logger.error(
          `Could not read the signed-in Azure DevOps identity: ${UNHANDLED_BY_WORKER}.`,
        );
        return null;
      }
      if (response.raw === null) {
        this.logger.error(
          `Could not read the signed-in Azure DevOps identity: ${response.error ?? `HTTP ${response.status}`}.`,
        );
        return null;
      }
      const user = parseCurrentUser(response.raw);
      if (user === null) {
        this.logger.error(
          `Azure DevOps answered the identity read (HTTP ${response.status}) with no signed-in user.`,
        );
      }
      return user;
    } catch (error) {
      this.logger.error("Could not read the signed-in Azure DevOps identity", error);
      return null;
    }
  }
}
