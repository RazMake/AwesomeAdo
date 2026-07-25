import { parseAdoContext } from "../navigation/AdoContext";

import type { AdoTeam, AdoWorkItemField, AdoWorkItemType } from "./AdoMetadata";

const API_VERSION = "7.1";
// Area classification trees are shallow in practice; 10 levels covers every realistic hierarchy
// while keeping the single request bounded.
const AREA_TREE_DEPTH = 10;
// ADO's teams endpoint pages its results; without $top it returns only the first 100 teams, which
// silently hides most teams in a large org. Request a large page so the in-page reader needs as few
// round-trips as possible, then let it page $skip to the end (see fetchAdoRawInPage).
const TEAMS_PAGE_SIZE = 1000;

/** The ADO REST endpoints the options page reads for a project: teams, area tree, types, fields. */
export interface AdoMetadataUrls {
  teamsUrl: string;
  areaPathsUrl: string;
  workItemTypesUrl: string;
  /** The project's field list, read only to learn which fields are date-typed (see `fetchAdoRawInPage`). */
  fieldsUrl: string;
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
 * Build the teams and area-tree REST URLs for the ADO organization/project named by `href`, or null
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
    areaPathsUrl: `${base}/${project}/_apis/wit/classificationnodes/areas?$depth=${AREA_TREE_DEPTH}&api-version=${API_VERSION}`,
    // The work-item-types list endpoint returns each type's states inline, so one request covers both
    // the type list and every type's states.
    workItemTypesUrl: `${base}/${project}/_apis/wit/workitemtypes?api-version=${API_VERSION}`,
    // The type-list body names each type's fields but never their data type, so the project field
    // list is read alongside it purely to learn which of those fields are date-typed.
    fieldsUrl: `${base}/${project}/_apis/wit/fields?api-version=${API_VERSION}`,
  };
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

/**
 * Depth-first flatten of a classification-node tree into `Parent\Child` path strings.
 *
 * The ADO classification tree names its implicit root with the `\Area` classifier, which is not part
 * of how users write an area path, so the flattened paths are rebuilt from node names instead of the
 * raw `path` field.
 */
export function flattenAreaPaths(root: unknown): string[] {
  const paths: string[] = [];
  const walk = (node: unknown, prefix: string): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }
    const { name, children } = node as { name?: unknown; children?: unknown };
    if (typeof name !== "string" || name.length === 0) {
      return;
    }
    const path = prefix === "" ? name : `${prefix}\\${name}`;
    paths.push(path);
    if (Array.isArray(children)) {
      for (const child of children) {
        walk(child, path);
      }
    }
  };
  walk(root, "");
  return paths;
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
