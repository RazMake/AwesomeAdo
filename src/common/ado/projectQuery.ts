import { parseAdoQueryId } from "../navigation/AdoQueryRoute";

import { ADO_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";
import { asRecord } from "./rawJson";

/** Azure DevOps' own name for a plain web link between a work item and a URL. */
export const HYPERLINK_RELATION = "Hyperlink";

/**
 * The comment stamped on the hyperlink this extension creates.
 *
 * A work item may carry any number of hyperlinks, and this stamp is the ONLY durable way to tell a
 * query this extension created — and may therefore delete again — from one somebody saved and linked
 * by hand. It decides ownership, never recognition: teams link a project's tracking query in Azure
 * DevOps long before this extension ever sees the project, and refusing to see those links reported
 * every such project as having no query at all.
 */
export const PROJECT_QUERY_LINK_COMMENT = "AwesomeADO project tracking query";

/** The project query linked to one work item, as the catalog needs to reason about it. */
export interface ProjectQueryLink {
  /** The project work item the link hangs off. */
  workItemId: number;
  /** The saved query's GUID, which is also its AwesomeADO binding key. */
  queryId: string;
  /**
   * The hyperlink's own address, so the query opens where Azure DevOps actually keeps it.
   *
   * Kept rather than rebuilt from the board's own URL: a link made by hand can point at a query in
   * another project of the organization, which a rebuilt address would silently redirect away from.
   */
  url: string;
  /**
   * Whether this extension created the link, and so may delete the query behind it.
   *
   * A query saved and linked by somebody else is still this project's tracking query — it answers
   * "does this project already have one?" — but removing it is not this extension's call.
   */
  managed: boolean;
}

/**
 * Characters Azure DevOps refuses in a saved query's name.
 *
 * Replaced rather than rejected: the name is derived from a work item title nobody wrote with query
 * naming rules in mind, and failing the whole command over a colon would be a worse answer than
 * creating the query under a slightly tidied name.
 */
const ILLEGAL_QUERY_NAME_CHARS = /[\\/$?*:"<>|#%&+=[\]]/g;

/** Azure DevOps' own limit on a saved query's name. */
const MAX_QUERY_NAME_LENGTH = 256;

/** Where a project query is saved when the catalog query's own folder cannot be determined. */
export const DEFAULT_QUERY_FOLDER = "Shared Queries";

/**
 * The tree query that reports on one project: the project itself plus everything beneath it.
 *
 * A TREE query rather than a flat one because that is what the Project Tracking view consumes — it
 * reports on one root item in depth, so a flat list of descendants would arrive with no hierarchy to
 * render. `MODE (Recursive)` is what makes the whole subtree come back rather than direct children.
 *
 * Both ends are pinned to the team project so a link reaching out of the project cannot drag foreign
 * work into the tree, and removed items are left out because they are deleted work nobody tracks.
 * `@project` rather than a literal name: Azure DevOps resolves it to the project the saved query
 * lives in, which is the one this extension just created it in — a name taken from anywhere else
 * (the tab URL, the configured team scope) could name a different project and quietly return
 * nothing. The selected columns and the assignee ordering are for the human who opens the saved
 * query in Azure DevOps; the view reads the fields it needs itself.
 */
export function buildProjectQueryWiql(projectId: number): string {
  return `SELECT
    [System.Id],
    [System.Title],
    [System.AssignedTo],
    [System.State],
    [Microsoft.VSTS.Scheduling.TargetDate],
    [Microsoft.VSTS.Scheduling.DueDate],
    [System.Tags],
    [System.IterationPath]
FROM workitemLinks
WHERE
    (
        [Source].[System.TeamProject] = @project
        AND [Source].[System.Id] = ${projectId}
    )
    AND (
        [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'
    )
    AND (
        [Target].[System.TeamProject] = @project
        AND [Target].[System.WorkItemType] <> ''
        AND NOT [Target].[System.State] IN ('Removed')
    )
ORDER BY [System.AssignedTo] DESC
MODE (Recursive)`;
}

/** The saved query's name: the project's title, tidied into something Azure DevOps accepts. */
export function projectQueryName(title: string): string {
  const cleaned = title
    .replace(ILLEGAL_QUERY_NAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    // ADO also refuses a name ending in a period, which a truncated title can easily produce.
    .replace(/\.+$/, "")
    .slice(0, MAX_QUERY_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : "Project";
}

/**
 * A second name to try when the first is already taken in the folder.
 *
 * Two projects are routinely given the same title, and Azure DevOps refuses a duplicate query name
 * outright. The work item id is appended because it is the one thing guaranteed to differ.
 */
export function uniqueProjectQueryName(title: string, projectId: number): string {
  const suffix = ` (#${projectId})`;
  return `${projectQueryName(title).slice(0, MAX_QUERY_NAME_LENGTH - suffix.length)}${suffix}`;
}

/**
 * Build the REST URL that creates a saved query inside `folderPath`, or null when `href` is not a
 * project-scoped ADO location.
 *
 * The folder's slashes stay literal while each segment is encoded: ADO reads the trailing path as a
 * folder hierarchy, so an encoded separator would ask for one folder whose name contains a slash.
 */
export function buildCreateQueryUrl(href: string, folderPath: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const folder = folderPath.trim().length > 0 ? folderPath.trim() : DEFAULT_QUERY_FOLDER;
  const encoded = folder
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${resolved.base}/${resolved.project}/_apis/wit/queries/${encoded}?api-version=${ADO_API_VERSION}`;
}

/**
 * The two halves of the delete-query endpoint, split where the query id goes.
 *
 * Exposed apart from `buildDeleteQueryUrl` because the caller that needs the rollback URL is the
 * page-world writer, which only learns the query's id after Azure DevOps has created it — and which
 * cannot import a URL builder at all.
 */
export function buildDeleteQueryUrlParts(href: string): { prefix: string; suffix: string } | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  return {
    prefix: `${base}/${project}/_apis/wit/queries/`,
    suffix: `?api-version=${ADO_API_VERSION}`,
  };
}

/** Build the REST URL that deletes a saved query by id, or null for a non-project ADO location. */
export function buildDeleteQueryUrl(href: string, queryId: string): string | null {
  const parts = buildDeleteQueryUrlParts(href);
  if (parts === null || queryId.trim().length === 0) {
    return null;
  }
  return `${parts.prefix}${encodeURIComponent(queryId)}${parts.suffix}`;
}

/**
 * Everything before the query id in the human-facing query URL, or null for a non-project ADO
 * location. Split for the same reason `buildDeleteQueryUrlParts` is.
 */
export function buildQueryWebUrlPrefix(href: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  return resolved === null ? null : `${resolved.base}/${resolved.project}/_queries/query/`;
}

/**
 * Build the ADO **web** URL that opens a saved query, or null for a non-project ADO location.
 *
 * The human-facing hub link, not the REST endpoint: it is what the hyperlink on the project work
 * item carries, so following it from Azure DevOps lands on the query rather than on raw JSON.
 */
export function buildQueryWebUrl(href: string, queryId: string): string | null {
  const prefix = buildQueryWebUrlPrefix(href);
  if (prefix === null || queryId.trim().length === 0) {
    return null;
  }
  return `${prefix}${encodeURIComponent(queryId)}`;
}

/** The id and name Azure DevOps assigned to a freshly created query, or null when it reported none. */
export function parseCreatedQuery(raw: unknown): { id: string; name: string } | null {
  const body = asRecord(raw);
  const id = body?.["id"];
  if (body === null || typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  const name = body["name"];
  return { id: id.toLowerCase(), name: typeof name === "string" ? name : "" };
}

/**
 * The project queries linked to the work items in a `workitemsbatch` response expanded with
 * relations.
 *
 * The link this extension stamped is preferred (see `PROJECT_QUERY_LINK_COMMENT`); when there is
 * none, a single saved-query hyperlink somebody added by hand is adopted instead, and reported as
 * not ours. A link pointing at a query FOLDER is never a candidate — a route naming no single query
 * cannot be opened as one.
 */
export function parseProjectQueryLinks(raw: unknown): ProjectQueryLink[] {
  const entries = (asRecord(raw)?.["value"] ?? raw) as unknown;
  if (!Array.isArray(entries)) {
    return [];
  }
  const links: ProjectQueryLink[] = [];
  for (const entry of entries) {
    const link = projectQueryLinkOf(entry);
    if (link !== null) {
      links.push(link);
    }
  }
  return links;
}

/** The saved query one relation points at, or null when it is not a link to a single query. */
function linkedQueryOf(raw: unknown): Omit<ProjectQueryLink, "workItemId"> | null {
  const relation = asRecord(raw);
  const url = relation?.["url"];
  if (relation === null || relation["rel"] !== HYPERLINK_RELATION || typeof url !== "string") {
    return null;
  }
  const queryId = parseAdoQueryId(url);
  if (queryId === null) {
    return null;
  }
  const comment = asRecord(relation["attributes"])?.["comment"];
  return { queryId, url, managed: comment === PROJECT_QUERY_LINK_COMMENT };
}

/**
 * The tracking query one expanded work item points at, or null when none can be named.
 *
 * A stamped link is taken first; failing that, a lone query hyperlink is adopted, because a project
 * whose only saved-query link is that one has no other candidate to mean. Several unstamped query
 * links means the item is left as having none: guessing which of them is "the" tracking query would
 * be picking whichever ADO happened to list first, and every command downstream would act on it.
 */
function projectQueryLinkOf(entry: unknown): ProjectQueryLink | null {
  const item = asRecord(entry);
  const id = item?.["id"];
  const relations = item?.["relations"];
  if (typeof id !== "number" || !Array.isArray(relations)) {
    return null;
  }
  const found = relations
    .map(linkedQueryOf)
    .filter((link): link is Omit<ProjectQueryLink, "workItemId"> => link !== null);
  const link =
    found.find((candidate) => candidate.managed) ?? (found.length === 1 ? found[0] : undefined);
  return link === undefined ? null : { workItemId: id, ...link };
}
