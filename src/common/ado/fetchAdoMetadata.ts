import { parseAdoContext } from "../navigation/AdoContext";

import type { AdoTeam, AdoWorkItemField, AdoWorkItemType } from "./AdoMetadata";
import { ADO_API_VERSION } from "./adoApi";

const API_VERSION = ADO_API_VERSION;
// ADO's teams endpoint pages its results; without $top it returns only the first 100 teams, which
// silently hides most teams in a large org. Request a large page so the in-page reader needs as few
// round-trips as possible, then let it page $skip to the end (see fetchAdoRawInPage).
const TEAMS_PAGE_SIZE = 1000;

/** Azure DevOps expands the saved-query hierarchy at most two levels per request. */
const QUERY_FOLDER_DEPTH = 5;

/** The ADO REST endpoints the options page reads for a project: teams, types, and fields. */
export interface AdoMetadataUrls {
  teamsUrl: string;
  workItemTypesUrl: string;
  /** The project's field list, read only to learn which fields are date-typed (see `fetchAdoRawInPage`). */
  fieldsUrl: string;
  /** The project's complete area hierarchy, used to suggest valid full area paths. */
  areaPathsUrl: string;
  /** The project's complete iteration hierarchy, used to suggest valid full iteration paths. */
  iterationPathsUrl: string;
  /** The project's saved-query hierarchy, used to suggest the folders a query can be created in. */
  queryFoldersUrl: string;
}

/**
 * The REST collection base for an ADO organization. On `dev.azure.com` the org is a path segment;
 * on the legacy `{org}.visualstudio.com` host the org IS the host, so the base is just the origin.
 */
export function adoCollectionBaseUrl(
  origin: string,
  hostname: string,
  organization: string,
): string {
  return hostname === "dev.azure.com" ? `${origin}/${encodeURIComponent(organization)}` : origin;
}

/**
 * Resolve the REST collection base and URL-encoded project for a project-scoped ADO `href`, or null
 * when the URL is not project-scoped (org-level or folder tabs have no project). Shared by the
 * metadata and tree URL builders so the parse-and-encode boilerplate lives in exactly one place.
 */
export function resolveAdoProjectContext(href: string): { base: string; project: string } | null {
  const context = parseAdoContext(href);
  if (context === null || context.project === null) {
    return null;
  }
  // parseAdoContext already validated the URL, so this cannot throw.
  const url = new URL(href);
  const base = adoCollectionBaseUrl(url.origin, url.hostname, context.organization);
  const project = encodeURIComponent(context.project);
  return { base, project };
}

/**
 * The REST collection base for the organization that owns `href`, or null when `href` is not a
 * recognized ADO location. Unlike `resolveAdoProjectContext` this does NOT need a project, for the
 * org-scoped services (identities) that are reachable from a folder or org-level tab too.
 *
 * WHY this must stay the collection base: it is the ONLY ADO host the extension can read with the
 * signed-in session. The separate `vssps` identity host answers a credentialed cross-origin fetch
 * with `Access-Control-Allow-Origin: *`, which the browser rejects outright for a request whose
 * credentials mode is `include` — see `mentionIdentities`.
 */
export function resolveAdoOrganizationBase(href: string): string | null {
  const context = parseAdoContext(href);
  if (context === null) {
    return null;
  }
  // parseAdoContext already validated the URL, so this cannot throw.
  const url = new URL(href);
  return adoCollectionBaseUrl(url.origin, url.hostname, context.organization);
}

/**
 * Build a TEAM-scoped ADO REST URL (`{base}/{project}/{team}/_apis/{path}?api-version=…`), or null
 * when `href` is not project-scoped or `team` is blank.
 *
 * Several ADO concepts are owned by a team rather than by the project — the iterations a team
 * subscribes to, the order it ranks its backlog in — and each is reached through the same
 * project/team/_apis shape. Building that shape in one place keeps every team-scoped endpoint
 * agreeing on the encoding and on the "no team means no URL" rule, which a per-endpoint copy of the
 * boilerplate had already started to duplicate.
 *
 * `apiVersion` is a parameter rather than the shared constant because not every team-scoped route
 * has left preview; the caller pins the version its own endpoint is served under.
 */
export function buildTeamScopedApiUrl(
  href: string,
  team: string,
  path: string,
  apiVersion: string,
): string | null {
  if (team.trim().length === 0) {
    return null;
  }
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  return `${base}/${project}/${encodeURIComponent(team)}/_apis/${path}?api-version=${apiVersion}`;
}

/**
 * Build the metadata REST URLs for the ADO organization/project named by `href`, or null
 * when the URL is not a project-scoped ADO location (org-level or folder tabs have nothing to fetch).
 *
 * URL construction is kept here — a pure, chrome-free module — so it can be unit-tested and reused,
 * while the credentialed fetch itself runs in the ADO page's MAIN world (see
 * `src/common/browser/fetchAdoRawInPage.ts`): an MV3 extension can only reach the ADO REST APIs with
 * the user's session from a first-party, same-origin request.
 */
export function buildAdoMetadataUrls(href: string): AdoMetadataUrls | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  return {
    teamsUrl: `${base}/_apis/projects/${project}/teams?$top=${TEAMS_PAGE_SIZE}&api-version=${API_VERSION}`,
    // The work-item-types list endpoint returns each type's states inline, so one request covers both
    // the type list and every type's states.
    workItemTypesUrl: `${base}/${project}/_apis/wit/workitemtypes?api-version=${API_VERSION}`,
    // The type-list body names each type's fields but never their data type, so the project field
    // list is read alongside it purely to learn which of those fields are date-typed.
    fieldsUrl: `${base}/${project}/_apis/wit/fields?api-version=${API_VERSION}`,
    areaPathsUrl: `${base}/${project}/_apis/wit/classificationnodes/areas?$depth=100&api-version=${API_VERSION}`,
    iterationPathsUrl: `${base}/${project}/_apis/wit/classificationnodes/iterations?$depth=100&api-version=${API_VERSION}`,
    // Azure DevOps caps the query hierarchy at two levels of expansion per request, so anything
    // deeper is reached one folder at a time — see `buildQueryFolderChildrenUrl`.
    queryFoldersUrl: `${base}/${project}/_apis/wit/queries?$depth=${QUERY_FOLDER_DEPTH}&api-version=${API_VERSION}`,
  };
}

/**
 * The URL that lists one folder's own contents, or null when `href` is not project-scoped.
 *
 * Azure DevOps answers the hierarchy endpoint two levels deep and caps a node's children, so a large
 * project simply cannot be enumerated in one read — the folders below that boundary are reached by
 * asking the folder the user is actually interested in. The folder's slashes stay literal while each
 * segment is encoded, because ADO reads the trailing path as a hierarchy.
 */
export function buildQueryFolderChildrenUrl(href: string, folderPath: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  const path = folderPath.trim();
  if (resolved === null || path.length === 0) {
    return null;
  }
  const encoded = path
    .split(/[/\\]/)
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${resolved.base}/${resolved.project}/_apis/wit/queries/${encoded}?$depth=${QUERY_FOLDER_DEPTH}&api-version=${API_VERSION}`;
}

/** Parse the project area hierarchy into full `System.AreaPath` values for autocomplete. */
export function parseAreaPaths(body: unknown): string[] {
  return parseClassificationPaths(body, "area");
}

/** Parse the project iteration hierarchy into full `System.IterationPath` values for autocomplete. */
export function parseIterationPaths(body: unknown): string[] {
  return parseClassificationPaths(body, "iteration");
}

/**
 * Both classification trees share a shape and a trap: ADO reports each node's `path` with the
 * structure's own segment (`\Project\Area\…`, `\Project\Iteration\…`) that the work item field never
 * carries, so it is stripped once here rather than by every caller.
 */
function parseClassificationPaths(body: unknown, structure: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  collectClassificationPaths(body, "", structure, paths, seen);
  return paths.sort((left, right) => left.localeCompare(right));
}

/** Parse the saved-query hierarchy into the folder paths a new query can be created in. */
export function parseQueryFolders(body: unknown): string[] {
  const folders: string[] = [];
  const seen = new Set<string>();
  collectQueryFolders((body as { value?: unknown } | null)?.value ?? body, folders, seen);
  return folders.sort((left, right) => left.localeCompare(right));
}

function collectQueryFolders(value: unknown, folders: string[], seen: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectQueryFolders(entry, folders, seen);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const raw = value as { path?: unknown; isFolder?: unknown; children?: unknown };
  const path = typeof raw.path === "string" ? raw.path.trim().replace(/^\/+/, "") : "";
  const key = path.toLocaleLowerCase();
  // Only a folder can hold a new query; a saved query's own path would be refused by ADO.
  if (raw.isFolder === true && path !== "" && !seen.has(key)) {
    seen.add(key);
    folders.push(path);
  }
  collectQueryFolders(raw.children, folders, seen);
}

interface ClassificationNode {
  path: string;
  children: readonly unknown[];
}

function parseClassificationNode(
  value: unknown,
  parentPath: string,
  structure: string,
): ClassificationNode | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { name?: unknown; path?: unknown; children?: unknown };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const supplied =
    typeof raw.path === "string" ? workItemPathFromClassificationPath(raw.path, structure) : "";
  const path = supplied || (parentPath === "" ? name : `${parentPath}\\${name}`);
  return { path: name === "" && supplied === "" ? "" : path, children: toChildren(raw.children) };
}

function workItemPathFromClassificationPath(path: string, structure: string): string {
  const parts = path
    .split("\\")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts[1]?.toLocaleLowerCase() === structure) parts.splice(1, 1);
  return parts.join("\\");
}

function toChildren(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectClassificationPaths(
  value: unknown,
  parentPath: string,
  structure: string,
  paths: string[],
  seen: Set<string>,
): void {
  const node = parseClassificationNode(value, parentPath, structure);
  if (node === null) return;
  const key = node.path.toLocaleLowerCase();
  if (node.path !== "" && !seen.has(key)) {
    seen.add(key);
    paths.push(node.path);
  }
  const childParent = node.path || parentPath;
  for (const child of node.children)
    collectClassificationPaths(child, childParent, structure, paths, seen);
}

/**
 * Parse the raw teams REST body into the picker's team list, sorted by name for a predictable order.
 *
 * Best-effort: a missing/malformed body or entries yield an empty (or filtered) list so the options
 * page still renders. The raw body comes from the MAIN-world fetch, which may hand back `null`.
 */
export function parseTeams(body: unknown): AdoTeam[] {
  const value = (body as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) {
    return [];
  }
  const teams = value.filter(isTeam).map((team) => ({ id: team.id, name: team.name }));
  teams.sort((left, right) => left.name.localeCompare(right.name));
  return teams;
}

function isTeam(value: unknown): value is AdoTeam {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { id, name } = value as { id?: unknown; name?: unknown };
  return typeof id === "string" && id.length > 0 && typeof name === "string" && name.length > 0;
}

/**
 * Parse the raw work-item-types REST body into the picker's list, sorted by name for a predictable
 * order.
 *
 * Best-effort like `parseTeams`: a missing/malformed body yields `[]`. Disabled types are dropped so
 * the picker only offers types the team can actually use, and each type keeps only its named states.
 *
 * `dateFieldReferenceNames` (from `parseDateFieldReferenceNames`) selects which of a type's inline
 * fields are date-typed; without it every type's `dateFields` is empty, so the type list still parses
 * before the separate field-list request resolves.
 */
export function parseWorkItemTypes(
  body: unknown,
  dateFieldReferenceNames: ReadonlySet<string> = new Set(),
): AdoWorkItemType[] {
  const value = (body as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) {
    return [];
  }
  const types = value.filter(isEnabledWorkItemType).map((type) => ({
    name: type.name,
    color: typeof type.color === "string" ? type.color : "",
    icon: typeof type.icon?.url === "string" ? type.icon.url : "",
    states: parseWorkItemStateNames(type.states),
    dateFields: parseTypeDateFields(type.fields, dateFieldReferenceNames),
  }));
  types.sort((left, right) => left.name.localeCompare(right.name));
  return types;
}

/**
 * Well-known Azure DevOps date fields that record a lifecycle/audit moment (set automatically by the
 * platform) rather than a user-chosen target. Offering these as an "ETA" would be misleading, so they
 * are excluded from the suggestions even though they are date-typed. Reference names are stable
 * identifiers, so matching on them is language-independent.
 */
const NON_TARGET_DATE_FIELD_REFERENCE_NAMES: ReadonlySet<string> = new Set([
  "System.CreatedDate", // Created Date
  "System.ChangedDate", // Changed Date (a.k.a. Modified Date)
  "System.AuthorizedDate", // Authorized Date (last revision timestamp)
  "System.RevisedDate", // Revised Date (revision bookkeeping)
  "Microsoft.VSTS.Common.StateChangeDate", // State Change Date
  "Microsoft.VSTS.Common.ActivatedDate", // Activated Date
  "Microsoft.VSTS.Common.ResolvedDate", // Resolved Date
  "Microsoft.VSTS.Common.ClosedDate", // Closed Date
]);

/**
 * Collect the reference names of every date-typed field that is eligible to be an ETA from the
 * project's field-list REST body.
 *
 * The type-list body names a type's fields but omits their data type, so this set is what tells the
 * two apart. Well-known system/lifecycle date fields (see `NON_TARGET_DATE_FIELD_REFERENCE_NAMES`)
 * are dropped here because they track when something happened, not a planned target. Best-effort: a
 * missing/malformed body yields an empty set, so no field is offered as an ETA until the field list
 * is available.
 */
export function parseDateFieldReferenceNames(body: unknown): Set<string> {
  const value = (body as { value?: unknown } | null)?.value;
  const referenceNames = new Set<string>();
  if (!Array.isArray(value)) {
    return referenceNames;
  }
  for (const field of value) {
    const { referenceName, type } = (field ?? {}) as { referenceName?: unknown; type?: unknown };
    // ADO reports date fields with the `dateTime` field type; only those can carry an ETA, and only
    // then if they are not one of the platform-managed lifecycle dates.
    if (
      type === "dateTime" &&
      typeof referenceName === "string" &&
      referenceName.length > 0 &&
      !NON_TARGET_DATE_FIELD_REFERENCE_NAMES.has(referenceName)
    ) {
      referenceNames.add(referenceName);
    }
  }
  return referenceNames;
}

/** The subset of the raw work-item-type body this module reads, before it is narrowed/normalized. */
interface RawWorkItemType {
  name: string;
  color?: unknown;
  icon?: { url?: unknown };
  states?: unknown;
  fields?: unknown;
  isDisabled?: unknown;
}

function isEnabledWorkItemType(value: unknown): value is RawWorkItemType {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { name, isDisabled } = value as { name?: unknown; isDisabled?: unknown };
  // A disabled type is hidden in ADO's own UI, so it must not be offered here either.
  return typeof name === "string" && name.length > 0 && isDisabled !== true;
}

function parseWorkItemStateNames(states: unknown): string[] {
  if (!Array.isArray(states)) {
    return [];
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const state of states) {
    const name = (state as { name?: unknown } | null)?.name;
    if (typeof name !== "string" || name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Pick a type's date-typed fields from its inline field list, keeping only fields whose reference
 * name is in `dateFieldReferenceNames`, deduped by reference name and sorted by display name.
 *
 * The type-list body carries a `name` per field (already localized by ADO), so that is used for the
 * label while the reference name — the stable identifier — is what gets persisted.
 */
function parseTypeDateFields(
  fields: unknown,
  dateFieldReferenceNames: ReadonlySet<string>,
): AdoWorkItemField[] {
  if (!Array.isArray(fields)) {
    return [];
  }
  const dateFields: AdoWorkItemField[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const { referenceName, name } = (field ?? {}) as { referenceName?: unknown; name?: unknown };
    if (
      typeof referenceName !== "string" ||
      !dateFieldReferenceNames.has(referenceName) ||
      seen.has(referenceName)
    ) {
      continue;
    }
    seen.add(referenceName);
    dateFields.push({
      referenceName,
      name: typeof name === "string" && name.length > 0 ? name : referenceName,
    });
  }
  dateFields.sort((left, right) => left.name.localeCompare(right.name));
  return dateFields;
}
