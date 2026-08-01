export const LOAD_QUERY_DEFINITION_MESSAGE = "awesomeado:load-query-definition";

export interface LoadQueryDefinitionMessage {
  type: typeof LOAD_QUERY_DEFINITION_MESSAGE;
  queryId: string;
}

export interface LoadQueryDefinitionResponse {
  raw: unknown;
  status: number;
  /** Transport or validation detail when no query body could be returned. */
  error?: string;
}

export function loadQueryDefinitionMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "message is not an object";
  const candidate = value as Partial<LoadQueryDefinitionMessage>;
  if (candidate.type !== LOAD_QUERY_DEFINITION_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${LOAD_QUERY_DEFINITION_MESSAGE}"`;
  }
  if (typeof candidate.queryId !== "string" || candidate.queryId.trim().length === 0) {
    return "queryId must be a non-empty string";
  }
  return null;
}

export function isLoadQueryDefinitionMessage(value: unknown): value is LoadQueryDefinitionMessage {
  return loadQueryDefinitionMessageProblem(value) === null;
}
