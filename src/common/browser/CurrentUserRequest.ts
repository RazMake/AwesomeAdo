export const READ_CURRENT_USER_MESSAGE = "awesomeado:read-current-user";

/**
 * Asks the worker who Azure DevOps considers signed in. It carries no parameters on purpose: the
 * organization is derived from the SENDER's own tab, so a content script can never point this read
 * at a collection it is not already on.
 */
export interface ReadCurrentUserMessage {
  type: typeof READ_CURRENT_USER_MESSAGE;
}

export interface ReadCurrentUserResponse {
  raw: unknown;
  status: number;
  /** Failure stage and reason; absent when a JSON body was read. */
  error?: string;
}

export function isReadCurrentUserMessage(value: unknown): value is ReadCurrentUserMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === READ_CURRENT_USER_MESSAGE
  );
}
