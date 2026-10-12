/**
 * The content→background contract for reading one work item type's allowed State changes.
 *
 * Only the worker can run the credentialed MAIN-world read, so the content side names the type and
 * the worker builds the URL from the SENDER's trusted tab — a closed "read this type" operation,
 * never a fetch-any-URL proxy.
 */
export const LOAD_STATE_TRANSITIONS_MESSAGE = "awesomeado:load-state-transitions";

export interface LoadStateTransitionsMessage {
  type: typeof LOAD_STATE_TRANSITIONS_MESSAGE;
  workItemType: string;
}

export interface LoadStateTransitionsResponse {
  /** The raw work item type body, or null when it could not be read. */
  raw: unknown;
  status: number;
  /** Transport or validation detail when no body could be returned. */
  error?: string;
}

export function loadStateTransitionsMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "message is not an object";
  const candidate = value as Partial<LoadStateTransitionsMessage>;
  if (candidate.type !== LOAD_STATE_TRANSITIONS_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${LOAD_STATE_TRANSITIONS_MESSAGE}"`;
  }
  if (typeof candidate.workItemType !== "string" || candidate.workItemType.trim().length === 0) {
    return "workItemType must be a non-empty string";
  }
  return null;
}

export function isLoadStateTransitionsMessage(
  value: unknown,
): value is LoadStateTransitionsMessage {
  return loadStateTransitionsMessageProblem(value) === null;
}
