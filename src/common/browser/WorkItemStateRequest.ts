/**
 * The content→background message contract for updating a work item's state.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * fetch the credentialed ADO REST API itself (CORS-blocked, and a same-origin fetch from the
 * extension page would drop ADO's session cookies). Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side asks it to do so and hand
 * back the result. Keeping the message shape here means both ends agree on one contract instead of
 * drifting apart.
 */
export const UPDATE_WORK_ITEM_STATE_MESSAGE = "awesomeado:update-work-item-state";

export interface UpdateWorkItemStateMessage {
  type: typeof UPDATE_WORK_ITEM_STATE_MESSAGE;
  id: number;
  rev: number;
  state: string;
}

export interface UpdateWorkItemStateResponse {
  ok: boolean;
  rev?: number;
  error?: string;
}

export function isUpdateWorkItemStateMessage(value: unknown): value is UpdateWorkItemStateMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<UpdateWorkItemStateMessage>;
  return (
    candidate.type === UPDATE_WORK_ITEM_STATE_MESSAGE &&
    typeof candidate.id === "number" &&
    typeof candidate.rev === "number" &&
    typeof candidate.state === "string"
  );
}
