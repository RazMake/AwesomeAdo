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

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
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

export function isCreateWorkItemMessage(value: unknown): value is CreateWorkItemMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<CreateWorkItemMessage>;
  return (
    candidate.type === CREATE_WORK_ITEM_MESSAGE &&
    isBoundedText(candidate.itemType, MAX_NAME_LENGTH) &&
    isBoundedText(candidate.title, MAX_TITLE_LENGTH) &&
    isTagList(candidate.tags) &&
    isClassificationPath(candidate.areaPath) &&
    isClassificationPath(candidate.iterationPath) &&
    isParentId(candidate.parentId)
  );
}

/** Why a claimed message cannot be served, or null when it is well-formed. */
export function createWorkItemMessageProblem(message: unknown): string | null {
  return isCreateWorkItemMessage(message) ? null : "malformed create-work-item request";
}
