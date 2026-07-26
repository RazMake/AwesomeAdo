/**
 * The content→background message contract for updating a single work item field.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * fetch the credentialed ADO REST API itself (CORS-blocked, and a same-origin fetch from the
 * extension page would drop ADO's session cookies). Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side asks it to do so and hand
 * back the result. Keeping the message shape here means both ends agree on one contract instead of
 * drifting apart.
 */
export const UPDATE_WORK_ITEM_FIELD_MESSAGE = "awesomeado:update-work-item-field";

export interface UpdateWorkItemFieldMessage {
  type: typeof UPDATE_WORK_ITEM_FIELD_MESSAGE;
  id: number;
  rev: number;
  /** The ADO field reference name to write (e.g. `System.State` or a type's ETA date field). */
  field: string;
  /** The value to set; `null` clears the field. */
  value: string | null;
}

export interface UpdateWorkItemFieldResponse {
  ok: boolean;
  rev?: number;
  error?: string;
}

export function isUpdateWorkItemFieldMessage(value: unknown): value is UpdateWorkItemFieldMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<UpdateWorkItemFieldMessage>;
  return (
    candidate.type === UPDATE_WORK_ITEM_FIELD_MESSAGE &&
    typeof candidate.id === "number" &&
    typeof candidate.rev === "number" &&
    typeof candidate.field === "string" &&
    (typeof candidate.value === "string" || candidate.value === null)
  );
}
