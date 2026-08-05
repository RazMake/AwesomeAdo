import type { WorkItemCreateResult } from "../ado/IWorkItemCreator";
import type { NewWorkItem } from "../ado/createWorkItem";

/**
 * The content→background message contract for creating one work item.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * reach the credentialed ADO REST API itself. Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side asks it to and gets the
 * result back. Keeping the shape here means both ends agree on one contract.
 */
export const CREATE_WORK_ITEM_MESSAGE = "awesomeado:create-work-item";

export interface CreateWorkItemMessage extends NewWorkItem {
  type: typeof CREATE_WORK_ITEM_MESSAGE;
  /** The work item type name. Named apart from `type` because that field is the message tag. */
  itemType: string;
}

export type CreateWorkItemResponse = WorkItemCreateResult;

/** Azure DevOps' own limit on `System.Title`; a longer one is refused by the server anyway. */
const MAX_TITLE_LENGTH = 255;

/** Azure DevOps' own limit on a single tag, and a bound on how many one creation may carry. */
const MAX_TAG_LENGTH = 400;
const MAX_TAGS = 20;

/** Generous bounds on names and classification paths, keeping this credentialed operation closed. */
const MAX_NAME_LENGTH = 128;
const MAX_CLASSIFICATION_PATH_LENGTH = 1024;

/** An identity handle (a sign-in address or a display name) the assignee field is resolved from. */
const MAX_IDENTITY_LENGTH = 256;

/** Author-written prose — a description, or the reason an item was raised. */
const MAX_PROSE_LENGTH = 32768;

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

/** A field the caller may simply not have: absent, explicitly none, or bounded text. */
function isOptionalText(value: unknown, max: number): value is string | null | undefined {
  return value === undefined || value === null || isBoundedText(value, max);
}

function isTagList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_TAGS &&
    value.every((tag: unknown) => isBoundedText(tag, MAX_TAG_LENGTH))
  );
}

function isClassificationPath(value: unknown): value is string | null {
  return value === null || isBoundedText(value, MAX_CLASSIFICATION_PATH_LENGTH);
}

/** A work item id the new item may be parented under; absent and null both mean "no parent". */
function isParentId(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
  );
}

/** Where the item is filed: its tags and the two classification paths. */
function hasValidFiling(candidate: Partial<CreateWorkItemMessage>): boolean {
  return (
    isTagList(candidate.tags) &&
    isClassificationPath(candidate.areaPath) &&
    isClassificationPath(candidate.iterationPath)
  );
}

/** What a form may have filled in beyond the item's identity: who owns it, and the words about it. */
function hasValidDetail(candidate: Partial<CreateWorkItemMessage>): boolean {
  return (
    isOptionalText(candidate.assignedTo, MAX_IDENTITY_LENGTH) &&
    isOptionalText(candidate.description, MAX_PROSE_LENGTH) &&
    isOptionalText(candidate.comment, MAX_PROSE_LENGTH)
  );
}

export function isCreateWorkItemMessage(value: unknown): value is CreateWorkItemMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<CreateWorkItemMessage>;
  return (
    candidate.type === CREATE_WORK_ITEM_MESSAGE &&
    isBoundedText(candidate.itemType, MAX_NAME_LENGTH) &&
    isBoundedText(candidate.title, MAX_TITLE_LENGTH) &&
    hasValidFiling(candidate) &&
    hasValidDetail(candidate) &&
    isParentId(candidate.parentId)
  );
}

/** Why a claimed message cannot be served, or null when it is well-formed. */
export function createWorkItemMessageProblem(message: unknown): string | null {
  return isCreateWorkItemMessage(message) ? null : "malformed create-work-item request";
}
