import { parseQueryDefinition, type QueryDefinitionResult } from "../ado/QueryDefinition";
import type { ILogger } from "../logging/ILogger";

import {
  LOAD_QUERY_DEFINITION_MESSAGE,
  type LoadQueryDefinitionMessage,
  type LoadQueryDefinitionResponse,
} from "./AdoQueryDefinitionRequest";
import { workerReplyProblem } from "./workerReply";

export type SendQueryDefinitionRequest = (
  message: LoadQueryDefinitionMessage,
) => Promise<LoadQueryDefinitionResponse | undefined>;

/** Loads the original saved WIQL independently from executing it. */
export class MessagingQueryDefinitionLoader {
  constructor(
    private readonly send: SendQueryDefinitionRequest,
    private readonly logger: ILogger,
  ) {}

  async load(queryId: string): Promise<QueryDefinitionResult> {
    try {
      const response = await this.send({ type: LOAD_QUERY_DEFINITION_MESSAGE, queryId });
      if (response === undefined) {
        const error = `Could not load query definition: ${workerReplyProblem(response)}.`;
        this.logger.error(error);
        return { wiql: null, error };
      }
      const wiql = parseQueryDefinition(response?.raw);
      if (wiql === null) {
        const detail = response.error ?? `HTTP ${response.status}`;
        const error = `Could not load query definition (${detail}).`;
        this.logger.error(error);
        return { wiql: null, error };
      }
      this.logger.info(`Loaded query definition for ${queryId}.`);
      return { wiql, error: null };
    } catch (error) {
      const message = "Could not load query definition.";
      this.logger.error(message, error);
      return { wiql: null, error: message };
    }
  }
}
