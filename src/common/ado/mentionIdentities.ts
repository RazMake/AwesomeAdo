import { resolveAdoOrganizationBase } from "./fetchAdoMetadata";

/**
 * The Identity Picker is pinned separately from `ADO_API_VERSION` because it has never left preview
 * and versions on its own schedule; the rest of this folder's reads are on the GA line.
 */
const IDENTITY_PICKER_API_VERSION = "5.2-preview.1";

/**
 * How many mention resolutions may be in flight at once.
 *
 * The picker answers ONE identity per request (see `buildAdoIdentityPickerRequest`), so a board that
 * mentions thirty people is thirty round-trips. Firing them all at once would stall the ADO page's
 * own requests behind the browser's per-host connection limit; a small pool keeps the board
 * responsive while still resolving a whole board in a fraction of the serial time.
 */
export const MENTION_REQUEST_CONCURRENCY = 6;

/**
 * The most identities one resolve request may ask about.
 *
 * A ceiling exists because the ids are supplied by the content side: without one, a page could turn
 * a single message into an unbounded number of credentialed requests. Since the picker costs one
 * request PER id, this ceiling is now a request budget rather than a URL-length budget, so it is far
 * lower than the batched read it replaced — 200 covers every realistic board (the tree is already
 * capped at two levels) and anything beyond it is a bug or an abuse, not a discussion.
 */
export const MAX_MENTION_IDS = 200;

/** The shape of an Azure DevOps identity GUID, as a pattern source (no anchors, no flags). */
const GUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/**
 * How Azure DevOps stores an `@`-mention inside Markdown: the person's identity GUID in brackets.
 *
 * Exported as a pattern SOURCE rather than a shared `RegExp` because a global regex carries a
 * mutable `lastIndex`; one shared instance would make two callers silently interfere. Both the
 * collector here and the renderer in `view-common/control/MarkdownText` build their own instance
 * from it, so the token shape is still defined exactly once.
 */
export const MENTION_TOKEN_PATTERN = `@<(${GUID_PATTERN})>`;

/**
 * The attribute Azure DevOps marks an `@`-mention anchor with in its own rich text, e.g.
 * `data-vss-mention="version:2.0,<guid>"`. The version prefix has changed before, so only the GUID
 * inside the value is matched — and either quote style is accepted, because the attribute is
 * re-serialized by whatever editor last touched the item.
 */
const RICH_TEXT_MENTION_PATTERN = `data-vss-mention=["'][^"']*?(${GUID_PATTERN})[^"']*["']`;

/**
 * Every identity GUID mentioned across `sources`, lowercased and de-duplicated.
 *
 * Both mention encodings are collected because the same board carries both: a work item description
 * stored as ADO rich text holds mention ANCHORS, while a description or note stored as Markdown holds
 * bare `@<guid>` TOKENS. Collecting them together is what lets one bulk read answer for the whole
 * board instead of resolving a name per note, per item.
 *
 * Order is the order first seen, so a batch stays stable between runs and a test can assert on it.
 */
export function collectMentionIdentityIds(sources: Iterable<string | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const source of sources) {
    if (typeof source !== "string" || source.length === 0) {
      continue;
    }
    for (const pattern of [MENTION_TOKEN_PATTERN, RICH_TEXT_MENTION_PATTERN]) {
      for (const match of source.matchAll(new RegExp(pattern, "g"))) {
        // Both patterns carry exactly one capture group, so a match always has group 1.
        ids.add(match[1]!.toLowerCase());
      }
    }
  }
  return [...ids];
}

/** Where to resolve mentions for one organization, and the ids worth asking about. */
export interface AdoIdentityPickerRequest {
  /** The org-scoped Identity Picker endpoint; the same URL answers for every id. */
  url: string;
  /** The well-formed, de-duplicated, lowercased ids to ask about — one request each. */
  ids: string[];
}

/**
 * Build the mention-resolution request for the organization that owns `href`, or null when there is
 * nothing (or nowhere) to ask.
 *
 * WHY the Identity Picker rather than the bulk `_apis/identities` read it replaced: the bulk read is
 * served only from the separate `vssps` host, and that host answers a credentialed cross-origin
 * fetch with `Access-Control-Allow-Origin: *` — which the browser rejects for any request whose
 * credentials mode is `include`. No header on our side can change that, so every mention resolved to
 * nothing. The picker is served from the collection base the page is already on, so the read is
 * same-origin and the session rides along with no CORS involved at all.
 *
 * The cost is that the picker resolves ONE identity per request: its `query` is a single opaque
 * string, and a comma-separated list comes back as one unmatched token rather than a batch. Callers
 * therefore issue a request per id (pooled by `MENTION_REQUEST_CONCURRENCY`), which is affordable
 * only because `MessagingMentionDirectory` memoizes every answer for the session — a person is asked
 * about once, not once per repaint.
 *
 * Anything that is not a well-formed GUID is DROPPED rather than passed through. The ids arrive from
 * the content side, so validating the shape here is what keeps a page from turning a mention resolve
 * into an arbitrary directory search.
 */
export function buildAdoIdentityPickerRequest(
  href: string,
  ids: readonly string[],
): AdoIdentityPickerRequest | null {
  const base = resolveAdoOrganizationBase(href);
  if (base === null) {
    return null;
  }
  const exact = new RegExp(`^${GUID_PATTERN}$`);
  const safe = [...new Set(ids.map((id) => id.trim().toLowerCase()))]
    .filter((id) => exact.test(id))
    .slice(0, MAX_MENTION_IDS);
  if (safe.length === 0) {
    return null;
  }
  return {
    url: `${base}/_apis/IdentityPicker/Identities?api-version=${IDENTITY_PICKER_API_VERSION}`,
    ids: safe,
  };
}

/** One resolved identity as the picker returns it; every field is optional on the wire. */
interface RawPickerIdentity {
  displayName?: unknown;
  signInAddress?: unknown;
  mail?: unknown;
}

/** One query's answer: the token echoed back, and the identities it matched (often none). */
interface RawPickerResult {
  queryToken?: unknown;
  identities?: unknown;
}

/**
 * Parse the Identity Picker bodies into display names keyed by LOWERCASE identity GUID.
 *
 * Keyed by the echoed `queryToken` rather than by any id field ON the identity, because the picker
 * returns BOTH `localId` (the ADO identity, which is what a mention stores) and `originId` (the
 * directory object behind it) and picking the wrong one keys every name under an id no mention will
 * ever look up. The token is by definition the id that was asked about.
 *
 * Best-effort like every other parser here: a missing or malformed body contributes nothing, so an
 * unresolvable mention renders as the neutral "@mention" label instead of breaking the view. An
 * identity with no usable name is left out for the same reason — a blank "@" is worse than the
 * placeholder.
 */
export function parseAdoIdentityNames(bodies: readonly unknown[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const body of bodies) {
    const results = (body as { results?: unknown } | null)?.results;
    if (!Array.isArray(results)) {
      continue;
    }
    for (const raw of results) {
      const named = namedIdentityIn(raw);
      if (named !== null) {
        names.set(named[0], named[1]);
      }
    }
  }
  return names;
}

/** One query's answer as an id/name pair, or null when it named nobody this map could be keyed by. */
function namedIdentityIn(raw: unknown): readonly [string, string] | null {
  const result = raw as RawPickerResult | null;
  const id = typeof result?.queryToken === "string" ? result.queryToken.toLowerCase() : null;
  const name = Array.isArray(result?.identities) ? displayNameIn(result.identities) : null;
  return id === null || name === null ? null : [id, name];
}

/**
 * The name to show for one query's matches, or null when none of them carry a usable one.
 *
 * A `uid` query matches at most one person, but the list is walked anyway so a directory that
 * returns a nameless placeholder ahead of the real match does not anonymize the mention. The display
 * name wins because it is what ADO's own mention chips render; the sign-in address and mail are last
 * resorts so a mention still reads as a person rather than a GUID.
 */
function displayNameIn(identities: readonly unknown[]): string | null {
  for (const raw of identities) {
    const identity = raw as RawPickerIdentity | null;
    for (const candidate of [identity?.displayName, identity?.signInAddress, identity?.mail]) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }
  }
  return null;
}
