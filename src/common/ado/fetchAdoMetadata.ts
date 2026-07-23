import { parseAdoContext } from "../navigation/AdoContext";

import type { AdoTeam } from "./AdoMetadata";

const API_VERSION = "7.1";
// Area classification trees are shallow in practice; 10 levels covers every realistic hierarchy
// while keeping the single request bounded.
const AREA_TREE_DEPTH = 10;
// ADO's teams endpoint pages its results; without $top it returns only the first 100 teams, which
// silently hides most teams in a large org. Request a large page so the in-page reader needs as few
// round-trips as possible, then let it page $skip to the end (see fetchAdoRawInPage).
const TEAMS_PAGE_SIZE = 1000;

/** The two ADO REST endpoints the options page reads for a project: its teams and its area tree. */
export interface AdoMetadataUrls {
  teamsUrl: string;
  areaPathsUrl: string;
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
 * Build the teams and area-tree REST URLs for the ADO organization/project named by `href`, or null
 * when the URL is not a project-scoped ADO location (org-level or folder tabs have nothing to fetch).
 *
 * URL construction is kept here — a pure, chrome-free module — so it can be unit-tested and reused,
 * while the credentialed fetch itself runs in the ADO page's MAIN world (see
 * `src/common/browser/fetchAdoRawInPage.ts`): an MV3 extension can only reach the ADO REST APIs with
 * the user's session from a first-party, same-origin request.
 */
export function buildAdoMetadataUrls(href: string): AdoMetadataUrls | null {
  const context = parseAdoContext(href);
  if (context === null || context.project === null) {
    return null;
  }
  // parseAdoContext already validated the URL, so this cannot throw.
  const url = new URL(href);
  const base = adoCollectionBaseUrl(url.origin, url.hostname, context.organization);
  const project = encodeURIComponent(context.project);
  return {
    teamsUrl: `${base}/_apis/projects/${project}/teams?$top=${TEAMS_PAGE_SIZE}&api-version=${API_VERSION}`,
    areaPathsUrl: `${base}/${project}/_apis/wit/classificationnodes/areas?$depth=${AREA_TREE_DEPTH}&api-version=${API_VERSION}`,
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
