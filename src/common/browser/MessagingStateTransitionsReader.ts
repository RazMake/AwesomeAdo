import {
  parseWorkItemStateTransitions,
  type IWorkItemStateTransitionsReader,
  type WorkItemStateTransitions,
} from "../ado/WorkItemStateTransitions";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_STATE_TRANSITIONS_MESSAGE,
  type LoadStateTransitionsMessage,
  type LoadStateTransitionsResponse,
} from "./AdoStateTransitionsRequest";
import { workerReplyProblem } from "./workerReply";

export type SendStateTransitionsRequest = (
  message: LoadStateTransitionsMessage,
) => Promise<LoadStateTransitionsResponse | undefined>;

/**
 * Reads a work item type's allowed State changes through the background worker.
 *
 * Deliberately unmemoized: it runs once per user-initiated State change, and a process edit made in
 * Azure DevOps must take effect without a page reload.
 */
export class MessagingStateTransitionsReader implements IWorkItemStateTransitionsReader {
  constructor(
    private readonly send: SendStateTransitionsRequest,
    private readonly logger: ILogger,
  ) {}

  async load(workItemType: string): Promise<WorkItemStateTransitions | null> {
    try {
      const response = await this.send({ type: LOAD_STATE_TRANSITIONS_MESSAGE, workItemType });
      if (response === undefined) {
        this.logger.error(
          `Could not load "${workItemType}" state transitions: ${workerReplyProblem(response)}.`,
        );
        return null;
      }
      const transitions = parseWorkItemStateTransitions(response.raw);
      if (transitions === null) {
        const detail = response.error ?? `HTTP ${response.status}, no transitions in the body`;
        this.logger.error(`Could not load "${workItemType}" state transitions (${detail}).`);
      }
      return transitions;
    } catch (error) {
      this.logger.error(`Could not load "${workItemType}" state transitions`, error);
      return null;
    }
  }
}
