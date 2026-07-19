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

/**
 * Message an extension page sends to an ADO tab's content script to learn the display name of the
 * saved query it is showing. Used by the options binding form's "scan all tabs" mode, where the id
 * comes from each tab's URL but the human-readable name only exists in the rendered page.
 */
export const ADO_QUERY_NAME_REQUEST = "awesomeado:query-name-request";

export interface AdoQueryNameRequest {
  type: typeof ADO_QUERY_NAME_REQUEST;
}

export interface AdoQueryNameResponse {
  /** The query's display name, or null when the content script could not read it. */
  name: string | null;
}

export function isAdoQueryNameRequest(value: unknown): value is AdoQueryNameRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<AdoQueryNameRequest>).type === ADO_QUERY_NAME_REQUEST
  );
}

/** One open ADO tab that shows a single saved query: its id plus its best-effort display name. */
export interface AdoQueryTab {
  /** The saved query's GUID, parsed from the tab URL. */
  queryId: string;
  /** The query's display name, or null when it could not be read from the page. */
  queryName: string | null;
}
