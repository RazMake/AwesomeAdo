/** Background → content message telling an ADO tab whether its sign-in has expired. */
export const ADO_SESSION_MESSAGE = "awesomeado:ado-session";

export interface AdoSessionMessage {
  type: typeof ADO_SESSION_MESSAGE;
  /** False once a request found the sign-in expired and silent renewal failed; true once restored. */
  signedIn: boolean;
}

export function isAdoSessionMessage(message: unknown): message is AdoSessionMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as Partial<AdoSessionMessage>;
  return candidate.type === ADO_SESSION_MESSAGE && typeof candidate.signedIn === "boolean";
}
