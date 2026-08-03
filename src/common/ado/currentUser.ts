import type { NoteAuthor } from "./WorkItemNote";
import { ADO_CONNECTION_DATA_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";
import { asRecord, nonEmptyString } from "./rawJson";

/**
 * Reads the identity Azure DevOps considers signed in for the current browser session.
 *
 * Abstract so callers depend on the question rather than on messaging or ADO's wire format
 * (Dependency Inversion): the real implementation asks the background worker to run a credentialed
 * MAIN-world fetch, and a test fake answers directly.
 */
export interface ICurrentUserReader {
  /** The signed-in identity, or null when it could not be read. */
  readCurrentUser(): Promise<NoteAuthor | null>;
}

/**
 * Build the org-level URL the signed-in identity is read from, or null when `href` is not a
 * recognizable project-scoped ADO location.
 *
 * `ConnectionData` is pinned to a PREVIEW api-version because it is served under no other kind: a
 * released version answers with an error envelope that parses as valid JSON carrying no identity,
 * which is indistinguishable from "nobody is signed in".
 */
export function buildAdoConnectionDataUrl(href: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  return resolved === null
    ? null
    : `${resolved.base}/_apis/ConnectionData?api-version=${ADO_CONNECTION_DATA_API_VERSION}`;
}

/**
 * Parse the signed-in identity out of a raw ConnectionData body, or null when it carries none.
 *
 * The sign-in address lives in a typed property bag (`properties.Account.$value`), not as a plain
 * field, so it is read defensively: a tenant that omits it still yields a usable identity from the
 * GUID alone.
 */
export function parseCurrentUser(rawConnection: unknown): NoteAuthor | null {
  const user = asRecord(asRecord(rawConnection)?.authenticatedUser);
  if (user === null) {
    return null;
  }
  const id = nonEmptyString(user.id);
  const uniqueName = nonEmptyString(asRecord(asRecord(user.properties)?.Account)?.$value);
  if (id === null && uniqueName === null) {
    // An identity that can be matched on neither handle answers no question a caller has — it can
    // neither authorize an edit nor be found in a team roster — so reporting none is the honest
    // result rather than an identity nothing will ever match.
    return null;
  }
  return {
    displayName: nonEmptyString(user.providerDisplayName) ?? uniqueName ?? "",
    id,
    uniqueName,
  };
}
