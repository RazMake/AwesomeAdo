import type { DirectoryUser } from "./IUserDirectory";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

/**
 * The Identity Picker preview API is pinned separately from `ADO_API_VERSION`: the picker endpoint
 * the Azure DevOps web UI itself calls has never graduated out of preview, so asking it for the
 * general `7.1` contract returns a version-not-supported error instead of identities.
 */
const IDENTITY_PICKER_API_VERSION = "5.0-preview.1";

/**
 * How many identities the picker asks Azure DevOps for. The list is scanned by eye in a small popup,
 * so a short page keeps the search responsive; a person who is not in the first screenful is found
 * by typing more of their name, not by scrolling.
 */
export const IDENTITY_SEARCH_MAX_RESULTS = 20;

/**
 * The shortest query the directory is asked about. One character matches most of an organization, so
 * the round-trip would cost a request per keystroke and still show nothing useful; below this the
 * picker only filters the suggestions it already has in memory.
 */
export const MIN_IDENTITY_SEARCH_LENGTH = 2;

/**
 * The request body the Identity Picker endpoint expects, built here (pure) so both the background
 * worker and its tests agree on one shape.
 */
export interface AdoIdentitySearchRequest {
  url: string;
  body: string;
}

/**
 * Build the credentialed Identity Picker search request for the organization that owns `href`, or
 * null when the URL is not a recognizable project-scoped ADO location.
 *
 * WHY this endpoint: it is the same one Azure DevOps' own people picker calls, so it resolves anyone
 * the signed-in user could assign work to (directory members included) rather than only the members
 * of one configured team. It is org-scoped and lives under the collection base, which keeps the
 * request same-origin with the ADO tab — the only way a MAIN-world fetch stays authenticated.
 *
 * `operationScopes` deliberately spans `ims` (identities already known to the organization) and
 * `source` (the backing directory), because a person who has never been assigned work in this
 * organization is exactly the case the picker previously could not resolve.
 *
 * The body is kept to the shape a known-good client uses against this endpoint. Nothing speculative
 * is added to it: this is a preview API, and every extra field is one more thing it can reject.
 */
export function buildAdoIdentitySearchRequest(
  href: string,
  query: string,
): AdoIdentitySearchRequest | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const trimmed = query.trim();
  if (trimmed.length < MIN_IDENTITY_SEARCH_LENGTH) {
    return null;
  }
  return {
    url: `${resolved.base}/_apis/IdentityPicker/Identities?api-version=${IDENTITY_PICKER_API_VERSION}`,
    body: JSON.stringify({
      query: trimmed,
      identityTypes: ["user"],
      operationScopes: ["ims", "source"],
      // Only the properties the picker actually renders or writes back are requested; the endpoint
      // returns whatever is asked for, and a fat projection makes every keystroke heavier.
      // `Active` is deliberately NOT among them — see `toDirectoryUser`.
      properties: ["DisplayName", "Mail", "SignInAddress"],
      options: { MinResults: 1, MaxResults: IDENTITY_SEARCH_MAX_RESULTS },
    }),
  };
}

/** One identity as the picker endpoint returns it; every field is optional on the wire. */
interface RawIdentity {
  localId?: unknown;
  displayName?: unknown;
  signInAddress?: unknown;
  mail?: unknown;
  image?: unknown;
}

/**
 * The identity groups in a picker response, whichever envelope it arrived in.
 *
 * The endpoint answers with `results` (its own shape), but an ADO collection wrapper can deliver the
 * same groups under `value` instead. Accepting both — and a bare array — means an envelope change
 * degrades to nothing worse than what is already parsed, rather than to a picker that finds nobody.
 */
function identityGroups(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  const envelope = body as { results?: unknown; value?: unknown } | null;
  if (Array.isArray(envelope?.results)) {
    return envelope.results;
  }
  return Array.isArray(envelope?.value) ? envelope.value : [];
}

/**
 * Parse the Identity Picker response into the directory's users, in the order ADO ranked them.
 *
 * Best-effort like the other ADO parsers: a missing or malformed body yields an empty list so the
 * picker degrades to "no matches" instead of breaking the view. Duplicates are removed because the
 * same person can be returned once per operation scope (`ims` and `source`).
 */
export function parseAdoIdentities(body: unknown): DirectoryUser[] {
  const users: DirectoryUser[] = [];
  const seen = new Set<string>();
  for (const result of identityGroups(body)) {
    const identities = (result as { identities?: unknown } | null)?.identities;
    if (!Array.isArray(identities)) {
      continue;
    }
    for (const identity of identities) {
      const user = toDirectoryUser(identity as RawIdentity);
      if (user === null) {
        continue;
      }
      const key = (user.uniqueName ?? user.displayName).toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      users.push(user);
    }
  }
  return users;
}

/**
 * The handle Azure DevOps matches an identity field against.
 *
 * The sign-in address is preferred over the contact mail address because they can differ (or the
 * mail can be missing entirely) for guest and service accounts, and only the sign-in address is
 * guaranteed to resolve back to the same identity.
 */
function uniqueNameOf(identity: RawIdentity): string | null {
  const { signInAddress, mail } = identity;
  if (typeof signInAddress === "string" && signInAddress.length > 0) {
    return signInAddress;
  }
  return typeof mail === "string" && mail.length > 0 ? mail : null;
}

/**
 * Narrow one raw identity to a `DirectoryUser`, or null when there is no name to show.
 *
 * It deliberately does NOT drop identities the endpoint flags as inactive. `active` reports whether
 * a person is already a member of THIS organization, so every hit that came from the backing
 * directory (`source`) — exactly the people the picker exists to find, and the ones ADO's own picker
 * happily offers — arrives flagged inactive and was being thrown away. A truly unassignable identity
 * is rejected by Azure DevOps at write time, where the board's save indicator reports it.
 */
function toDirectoryUser(identity: RawIdentity): DirectoryUser | null {
  if (typeof identity !== "object" || identity === null) {
    return null;
  }
  const { displayName, image } = identity;
  if (typeof displayName !== "string" || displayName.length === 0) {
    return null;
  }
  return {
    id: typeof identity.localId === "string" ? identity.localId : null,
    displayName,
    uniqueName: uniqueNameOf(identity),
    imageUrl: typeof image === "string" && image.length > 0 ? image : null,
  };
}
