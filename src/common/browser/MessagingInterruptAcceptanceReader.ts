import type {
  IInterruptAcceptanceReader,
  InterruptAcceptanceRequest,
  InterruptAcceptanceResult,
} from "../ado/IInterruptAcceptanceReader";
import { isInterruptAccepted } from "../ado/interruptAcceptance";
import type { ILogger } from "../logging/ILogger";

import {
  READ_INTERRUPT_ACCEPTANCE_MESSAGE,
  type ReadInterruptAcceptanceMessage,
  type ReadInterruptAcceptanceResponse,
} from "./InterruptAcceptanceRequest";
import { workerReplyProblem } from "./workerReply";

export type SendInterruptAcceptanceRequest = (
  message: ReadInterruptAcceptanceMessage,
) => Promise<ReadInterruptAcceptanceResponse | undefined>;

/** Messaging implementation of the timestamp-aware interrupt acceptance read. */
export class MessagingInterruptAcceptanceReader implements IInterruptAcceptanceReader {
  constructor(
    private readonly send: SendInterruptAcceptanceRequest,
    private readonly logger: ILogger,
  ) {}

  async readInterruptAcceptance(
    request: InterruptAcceptanceRequest,
  ): Promise<InterruptAcceptanceResult> {
    if (request.workItemIds.length === 0 || request.acceptanceTag.trim().length === 0) {
      return { acceptedWorkItemIds: [], failedWorkItemIds: [], error: null };
    }
    const message: ReadInterruptAcceptanceMessage = {
      type: READ_INTERRUPT_ACCEPTANCE_MESSAGE,
      ...request,
    };
    try {
      const response = await this.send(message);
      if (response === undefined || response === null || response.raw === null) {
        const error = workerReplyProblem(response);
        this.logger.error(
          `Interrupt acceptance read failed for ${request.workItemIds.length} item(s): ${error}.`,
        );
        return { acceptedWorkItemIds: [], failedWorkItemIds: request.workItemIds, error };
      }
      const { evidence, failedIds, failure, status } = response.raw;
      const acceptedWorkItemIds = evidence
        .filter((entry) => isInterruptAccepted(entry, request.acceptanceTag))
        .map((entry) => entry.workItemId);
      const error = failure === "none" ? null : `${failure} (HTTP ${status})`;
      if (error !== null) {
        this.logger.error(
          `Interrupt acceptance read lost ${failedIds.length} of ${request.workItemIds.length} item(s): ${error}.`,
        );
      }
      this.logger.info(
        `Interrupt acceptance read for ${request.workItemIds.length} item(s): ` +
          `accepted=${acceptedWorkItemIds.length}, failed=${failedIds.length}.`,
      );
      return { acceptedWorkItemIds, failedWorkItemIds: failedIds, error };
    } catch (error) {
      this.logger.error(
        `Could not read interrupt acceptance for ${request.workItemIds.length} item(s)`,
        error,
      );
      return {
        acceptedWorkItemIds: [],
        failedWorkItemIds: request.workItemIds,
        error: "could not reach Azure DevOps",
      };
    }
  }
}
