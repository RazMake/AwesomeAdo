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

/**
 * An Azure DevOps field reference name: dot-separated identifier segments, e.g. `System.State` or
 * `Microsoft.VSTS.Scheduling.TargetDate`. At least two segments, because every real ADO field is
 * namespaced.
 *
 * WHY the shape is enforced rather than accepting any string: the background worker forwards this
 * value into a MAIN-world credentialed PATCH, where it is concatenated into a JSON Pointer
 * (`"/fields/" + field`). A name containing `/` or `~` would address a different node than intended
 * under RFC 6901, and a name outside this shape cannot identify a real field anyway — so rejecting
 * it here keeps the "update one field on one item" operation genuinely closed, and removes the need
 * for pointer escaping downstream.
 */
const FIELD_REFERENCE_NAME = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;

/** Whether `value` is a syntactically valid ADO field reference name (see `FIELD_REFERENCE_NAME`). */
export function isFieldReferenceName(value: unknown): value is string {
  return typeof value === "string" && FIELD_REFERENCE_NAME.test(value);
}

/** A work item id: a positive integer, since it is interpolated into the update URL. */
function isWorkItemId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isUpdateWorkItemFieldMessage(value: unknown): value is UpdateWorkItemFieldMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<UpdateWorkItemFieldMessage>;
  return (
    candidate.type === UPDATE_WORK_ITEM_FIELD_MESSAGE &&
    isWorkItemId(candidate.id) &&
    typeof candidate.rev === "number" &&
    Number.isInteger(candidate.rev) &&
    isFieldReferenceName(candidate.field) &&
    (typeof candidate.value === "string" || candidate.value === null)
  );
}
