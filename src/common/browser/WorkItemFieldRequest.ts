import type { MultilineFieldFormat } from "../ado/IWorkItemFieldWriter";

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
  /**
   * The storage format to put a MULTILINE field into as part of this write; omitted leaves the
   * field's current format alone. Constrained to the two ADO accepts so a caller-supplied string can
   * never reach the patch body — the same closed-operation reasoning as `isFieldReferenceName`.
   */
  multilineFormat?: MultilineFieldFormat;
  /**
   * A discussion comment recorded as part of the same revision (`System.History`). Plain text — the
   * MAIN-world patch escapes it for the HTML field it lands in.
   */
  comment?: string;
  /**
   * The value the sender believes `field` currently holds, which authorizes ONE rebase-and-retry
   * after a stale-rev refusal (see `updateWorkItemFieldInPage`). Omitted means "never rebase".
   *
   * Safe to accept from the content side: it can only ever make the patch run against a rev the
   * SERVER just reported, never widen what the patch does — the field, the value and the pointer are
   * all still the ones already validated above.
   */
  baseValue?: string | null;
}

export interface UpdateWorkItemFieldResponse {
  ok: boolean;
  rev?: number;
  error?: string;
}

/**
 * What the background worker hands the MAIN-world patch: the message's own values plus the update
 * URL it built from the SENDER's trusted tab URL (which is why this is not simply the message).
 *
 * ONE object rather than an argument each because `chrome.scripting.executeScript` requires every
 * entry of `args` to be JSON-serializable, and `undefined` is not — an omitted optional argument
 * leaves an unserializable hole in that array and Chrome rejects the whole injection before it runs.
 * Optional *properties* just disappear when the object is serialized, so this shape stays safe as it
 * grows.
 */
export interface UpdateWorkItemFieldConfig {
  /** The item's `_apis/wit/workitems/{id}` endpoint, already resolved from the sender's tab. */
  updateUrl: string;
  /** The item's last-known rev, asserted by the patch's `test` op. */
  rev: number;
  field: string;
  value: string | null;
  multilineFormat?: MultilineFieldFormat;
  /** Plain text; the patch escapes it for the HTML field it lands in. */
  comment?: string;
  /** The field's expected current value; supplying it authorizes one rebase after a stale rev. */
  baseValue?: string | null;
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

/** Whether `value` is one of the two multiline storage formats ADO accepts, or simply absent. */
function isMultilineFormat(value: unknown): value is MultilineFieldFormat | undefined {
  return value === undefined || value === "Markdown" || value === "Html";
}

/** A revision number: any integer, since it is only ever echoed back into the patch's `test` op. */
function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** The field's new value: any string, or `null` to clear it. */
function isFieldValue(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

/** The field's expected current value: like a field value, or simply absent ("never rebase"). */
function isBaseValue(value: unknown): value is string | null | undefined {
  return value === undefined || isFieldValue(value);
}

/** An optional plain-text comment to record in the same revision. */
function isComment(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

export function isUpdateWorkItemFieldMessage(value: unknown): value is UpdateWorkItemFieldMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<UpdateWorkItemFieldMessage>;
  return (
    candidate.type === UPDATE_WORK_ITEM_FIELD_MESSAGE &&
    isWorkItemId(candidate.id) &&
    isRevision(candidate.rev) &&
    isFieldReferenceName(candidate.field) &&
    isMultilineFormat(candidate.multilineFormat) &&
    isComment(candidate.comment) &&
    isBaseValue(candidate.baseValue) &&
    isFieldValue(candidate.value)
  );
}
