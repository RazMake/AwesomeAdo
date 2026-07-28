/**
 * The content→background message contract for resolving `@`-mention identities to display names.
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * reach the credentialed ADO REST API itself (CORS-blocked; a same-origin fetch from the extension
 * page drops ADO's SameSite session cookies). Only the background service worker can run the fetch
 * that carries the signed-in session, so the content side names the identity ids it found in the
 * board's descriptions and notes, and the worker hands back the raw bodies for parsing.
 *
 * The ids are content-supplied, but the request URL is still built background-side from the SENDER's
 * trusted tab URL — and each id is re-validated as a GUID before it is sent — so this stays a closed
 * "who are these people in this organization?" operation, not a fetch-any-URL proxy.
 */
export const RESOLVE_ADO_IDENTITY_NAMES_MESSAGE = "awesomeado:resolve-ado-identity-names";

export interface ResolveAdoIdentityNamesMessage {
  type: typeof RESOLVE_ADO_IDENTITY_NAMES_MESSAGE;
  /** The identity GUIDs found in the content being rendered. */
  ids: string[];
}

export interface ResolveAdoIdentityNamesResponse {
  /**
   * One raw Identity Picker body per id that was read, or null when nothing could be read at all. A
   * partial list is deliberate: names that DID resolve are still worth rendering, and the requests
   * that failed are reported to the diagnostics log rather than discarding the rest.
   */
  raw: unknown[] | null;
  /**
   * Whether every requested id was actually put to Azure DevOps and answered for.
   *
   * This is what separates "ADO does not know that identity" from "nobody managed to ask". A query
   * for an id ADO cannot resolve comes back as an EMPTY match rather than an error, so it is
   * indistinguishable from a failed request without this flag — and the caller would then remember a
   * transient outage as a permanent "this person has no name". False when any request failed or the
   * id list was truncated.
   */
  complete: boolean;
}

export function isResolveAdoIdentityNamesMessage(
  value: unknown,
): value is ResolveAdoIdentityNamesMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ResolveAdoIdentityNamesMessage>;
  return (
    candidate.type === RESOLVE_ADO_IDENTITY_NAMES_MESSAGE &&
    Array.isArray(candidate.ids) &&
    candidate.ids.every((id) => typeof id === "string")
  );
}
