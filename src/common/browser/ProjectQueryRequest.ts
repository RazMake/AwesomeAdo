import type {
  CreateProjectQueryRequest,
  DeleteProjectQueryRequest,
} from "../ado/IProjectQueryService";

/**
 * The content→background message contract for a project's own saved tracking query.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * reach the credentialed ADO REST API itself. Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side asks it to and gets the
 * result back. Keeping the shape here means both ends agree on one contract.
 */
export const PROJECT_QUERY_MESSAGE = "awesomeado:project-query";

/** Ask which of these projects already own a tracking query. */
export interface ReadProjectQueryLinksMessage {
  type: typeof PROJECT_QUERY_MESSAGE;
  operation: "read-links";
  ids: number[];
}

/** Ask for a project's tracking query to be created and linked. */
export interface CreateProjectQueryMessage extends CreateProjectQueryRequest {
  type: typeof PROJECT_QUERY_MESSAGE;
  operation: "create";
}

/** Ask for a project's tracking query to be unlinked and deleted. */
export interface RemoveProjectQueryMessage extends DeleteProjectQueryRequest {
  type: typeof PROJECT_QUERY_MESSAGE;
  operation: "remove";
}

export type ProjectQueryMessage =
  ReadProjectQueryLinksMessage | CreateProjectQueryMessage | RemoveProjectQueryMessage;

/** What the worker answers with: the shape is per operation, so every field is optional. */
export interface ProjectQueryResponse {
  ok: boolean;
  /** The expanded work items, for `read-links`. */
  raw?: unknown;
  /** The created query's id, for `create`. */
  queryId?: string;
  /** The project work item's revision after a link changed. */
  rev?: number;
  error?: string;
}

/** A bound on how many projects one read may ask about, keeping the operation closed. */
const MAX_LINK_IDS = 1000;

/** A generous bound on a project title and a query folder path. */
const MAX_TITLE_LENGTH = 255;
const MAX_FOLDER_LENGTH = 1024;

const QUERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isWorkItemId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function claimsProjectQuery(value: unknown): value is { operation?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === PROJECT_QUERY_MESSAGE
  );
}

function isReadLinks(candidate: Partial<ReadProjectQueryLinksMessage>): boolean {
  return (
    Array.isArray(candidate.ids) &&
    candidate.ids.length > 0 &&
    candidate.ids.length <= MAX_LINK_IDS &&
    candidate.ids.every(isWorkItemId)
  );
}

function isCreate(candidate: Partial<CreateProjectQueryMessage>): boolean {
  return (
    isWorkItemId(candidate.projectId) &&
    isBoundedText(candidate.projectTitle, MAX_TITLE_LENGTH) &&
    isRevision(candidate.rev) &&
    isBoundedText(candidate.folderPath, MAX_FOLDER_LENGTH)
  );
}

function isRemove(candidate: Partial<RemoveProjectQueryMessage>): boolean {
  return (
    isWorkItemId(candidate.projectId) &&
    typeof candidate.queryId === "string" &&
    QUERY_ID_PATTERN.test(candidate.queryId) &&
    isRevision(candidate.rev)
  );
}

/** Whether this message is one this extension's worker answers, before any field is trusted. */
export function isProjectQueryMessage(value: unknown): value is ProjectQueryMessage {
  return claimsProjectQuery(value);
}

/** Why a claimed message cannot be served, or null when it is well-formed. */
export function projectQueryMessageProblem(value: unknown): string | null {
  if (!claimsProjectQuery(value)) {
    return "not a project-query request";
  }
  const candidate = value as Partial<ProjectQueryMessage> & { operation?: unknown };
  if (candidate.operation === "read-links") {
    return isReadLinks(candidate as Partial<ReadProjectQueryLinksMessage>)
      ? null
      : "malformed project-query link read";
  }
  if (candidate.operation === "create") {
    return isCreate(candidate as Partial<CreateProjectQueryMessage>)
      ? null
      : "malformed project-query create";
  }
  if (candidate.operation === "remove") {
    return isRemove(candidate as Partial<RemoveProjectQueryMessage>)
      ? null
      : "malformed project-query remove";
  }
  return `unknown project-query operation ${String(candidate.operation)}`;
}
