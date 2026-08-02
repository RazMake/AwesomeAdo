/**
 * Parses Azure DevOps organization/project identity from a URL, and defines the message contract
 * the options page uses to ask an ADO content script which theme it is currently rendering.
 *
 * Kept separate from AdoQueryRoute (which only answers "is this a Query page?") because identity
 * and theme are cross-page concerns consumed by the options UI, not just the content blanker.
 */

import { parseSupportedAdoUrl, VISUAL_STUDIO_SUFFIX } from "./AdoHost";

/** The two ADO themes the extension can distinguish from a rendered page. */
export type AdoTheme = "light" | "dark";

/** The Azure DevOps organization and (when present) project a URL points at. */
export interface AdoContext {
  organization: string;
  /** Null on org-level Query URLs that do not name a project. */
  project: string | null;
}

/** ADO identity plus the theme the live tab is rendering (null when it cannot be determined). */
export interface AdoTabContext extends AdoContext {
  theme: AdoTheme | null;
}

/**
 * Extract the organization and project from a hosted Azure DevOps URL, or null when the URL is not
 * a recognized ADO location. Handles both URL shapes:
 *   https://dev.azure.com/{org}/{project}/...
 *   https://{org}.visualstudio.com/{project}/...
 */
export function parseAdoContext(rawUrl: string): AdoContext | null {
  const url = parseSupportedAdoUrl(rawUrl);
  if (url === null) {
    return null;
  }
  // Leading path segment on ADO is either the org (dev.azure.com) or the project (*.visualstudio).
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

  if (url.hostname === "dev.azure.com") {
    const organization = firstNamedSegment(segments, 0);
    if (organization === null) {
      return null;
    }
    return { organization, project: firstNamedSegment(segments, 1) };
  }

  // The remaining supported shape is `{org}.visualstudio.com`, where the org is the host label.
  const organization = url.hostname.slice(0, -VISUAL_STUDIO_SUFFIX.length);
  if (organization.length === 0) {
    return null;
  }
  return { organization, project: firstNamedSegment(segments, 0) };
}

/**
 * Returns the decoded path segment at `index`, or null when it is missing or an ADO area token
 * (segments beginning with `_`, e.g. `_queries`, are areas — never org/project names).
 */
function firstNamedSegment(segments: string[], index: number): string | null {
  const segment = segments[index];
  if (segment === undefined || segment.startsWith("_")) {
    return null;
  }
  return decodeURIComponent(segment);
}

/**
 * Rebuild a project URL for `context` on the ADO host that serves `hostHref`, or null when that host
 * is not ADO or the context names no project.
 *
 * The inverse of {@link parseAdoContext}, and the reason it takes a host rather than assuming one:
 * an org reachable at `dev.azure.com` may equally be reachable at `{org}.visualstudio.com`, and only
 * a URL on the SAME origin as an already-open tab can be fetched with the user's session. So the
 * caller supplies a real open ADO URL and this substitutes the project it actually wants to address.
 */
export function buildAdoContextUrl(hostHref: string, context: AdoContext): string | null {
  const url = parseSupportedAdoUrl(hostHref);
  if (url === null || context.project === null) {
    return null;
  }
  const segments =
    url.hostname === "dev.azure.com" ? [context.organization, context.project] : [context.project];
  return `${url.origin}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

/** Message an extension page sends to an ADO tab's content script to learn its rendered theme. */
export const ADO_THEME_REQUEST = "awesomeado:theme-request";

export interface AdoThemeRequest {
  type: typeof ADO_THEME_REQUEST;
}

export interface AdoThemeResponse {
  theme: AdoTheme | null;
}

export function isAdoThemeRequest(value: unknown): value is AdoThemeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<AdoThemeRequest>).type === ADO_THEME_REQUEST
  );
}
