import type { ProjectQueryLink } from "./projectQuery";

/** Ask for one project's own tracking query to be created and linked to it. */
export interface CreateProjectQueryRequest {
  /** The project work item the query reports on, and which the new hyperlink hangs off. */
  projectId: number;
  /** The project's title, which the saved query is named after. */
  projectTitle: string;
  /** The project work item's last-known revision, used as the guard on the link patch. */
  rev: number;
  /** The query folder the new query is saved in — normally the catalog query's own folder. */
  folderPath: string;
}

/** The outcome of creating and linking a project query. */
export interface CreateProjectQueryResult {
  ok: boolean;
  /** The saved query's GUID, which is also the AwesomeADO binding key; present only when `ok`. */
  queryId?: string;
  /** The project work item's revision after the link landed. */
  rev?: number;
  error?: string;
}

/** Ask for one project's tracking query to be unlinked and deleted. */
export interface DeleteProjectQueryRequest {
  projectId: number;
  queryId: string;
  /** The project work item's last-known revision, used as the guard on the unlink patch. */
  rev: number;
}

/** The outcome of unlinking and deleting a project query. */
export interface DeleteProjectQueryResult {
  ok: boolean;
  /** The project work item's revision after the unlink landed. */
  rev?: number;
  error?: string;
}

/** Every project query link found on the requested work items. */
export interface ProjectQueryLinksResult {
  links: ProjectQueryLink[];
  error: string | null;
}

/**
 * The lifecycle of a project's own saved tracking query: which projects already have one, creating
 * and linking one, and unlinking plus deleting it again.
 *
 * All three live on ONE contract because they are the same fact seen from three sides — a project
 * either owns a tracking query or it does not — and splitting them would let a caller offer to
 * create a second query for a project it never asked about.
 */
export interface IProjectQueryService {
  /** Which of `workItemIds` already carry an AwesomeADO tracking query link. */
  readLinks(workItemIds: readonly number[]): Promise<ProjectQueryLinksResult>;
  create(request: CreateProjectQueryRequest): Promise<CreateProjectQueryResult>;
  remove(request: DeleteProjectQueryRequest): Promise<DeleteProjectQueryResult>;
}
