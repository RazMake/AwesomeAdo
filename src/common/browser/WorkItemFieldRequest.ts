import type {
  AdditionalWorkItemFieldWrite,
  MultilineFieldFormat,
  WorkItemFieldWriteRequest,
  WorkItemFieldWriteResult,
  WorkItemFieldPrecondition,
} from "../ado/IWorkItemFieldWriter";

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

export interface UpdateWorkItemFieldMessage extends WorkItemFieldWriteRequest {
  type: typeof UPDATE_WORK_ITEM_FIELD_MESSAGE;
}

export type UpdateWorkItemFieldResponse = WorkItemFieldWriteResult;

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
export interface UpdateWorkItemFieldConfig extends Omit<WorkItemFieldWriteRequest, "id"> {
  /** The item's `_apis/wit/workitems/{id}` endpoint, already resolved from the sender's tab. */
  updateUrl: string;
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

type FieldEntry = AdditionalWorkItemFieldWrite | WorkItemFieldPrecondition;

function isBoundedFieldList(value: unknown, fields: Set<string>): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 8) return false;
  return value.every((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const candidate = entry as Partial<FieldEntry>;
    if (!isFieldReferenceName(candidate.field) || !isFieldValue(candidate.value)) return false;
    if (fields.has(candidate.field)) return false;
    fields.add(candidate.field);
    return true;
  });
}

/** A small, duplicate-free list of extra field writes keeps this credentialed operation bounded. */
function isAdditionalFields(
  value: unknown,
  primaryField: string | undefined,
): value is AdditionalWorkItemFieldWrite[] | undefined {
  return isBoundedFieldList(value, new Set(primaryField === undefined ? [] : [primaryField]));
}

/** A small, duplicate-free list keeps the extra server-side tests bounded. */
function isPreconditions(value: unknown): value is WorkItemFieldPrecondition[] | undefined {
  return isBoundedFieldList(value, new Set<string>());
}

/** The field's expected current value: like a field value, or simply absent ("never rebase"). */
function isBaseValue(value: unknown): value is string | null | undefined {
  return value === undefined || isFieldValue(value);
}

/** An optional plain-text comment to record in the same revision. */
function isComment(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function hasValidFieldChanges(candidate: Partial<UpdateWorkItemFieldMessage>): boolean {
  return (
    isFieldReferenceName(candidate.field) &&
    isAdditionalFields(candidate.additionalFields, candidate.field) &&
    isFieldValue(candidate.value)
  );
}

function hasValidWriteMetadata(candidate: Partial<UpdateWorkItemFieldMessage>): boolean {
  return (
    isPreconditions(candidate.preconditions) &&
    isMultilineFormat(candidate.multilineFormat) &&
    isComment(candidate.comment) &&
    isBaseValue(candidate.baseValue)
  );
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
    hasValidFieldChanges(candidate) &&
    hasValidWriteMetadata(candidate)
  );
}
