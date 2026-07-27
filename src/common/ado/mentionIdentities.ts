import { resolveAdoIdentityServiceBase } from "./fetchAdoMetadata";

/**
 * The identity service is pinned separately from `ADO_API_VERSION` only so the bulk read stays on a
 * version that is documented as generally available; the endpoint lives on a different service host
 * from every other call in this folder and versions on its own schedule.
 */
const IDENTITIES_API_VERSION = "7.1";

/**
 * How many identity GUIDs one bulk read asks about.
 *
 * The ids travel in the query string, so the batch is bounded by URL length rather than by server
 * paging: 100 dashed GUIDs plus separators is roughly 3.7 KB, comfortably inside every proxy's
 * limit while still collapsing a whole board's mentions into one or two round-trips.
 */
export const MENTION_BATCH_SIZE = 100;

/**
 * The most identities one resolve request may ask about, across all batches.
 *
 * A ceiling exists because the ids are supplied by the content side: without one, a page could turn
 * a single message into an unbounded number of credentialed requests. Ten batches covers every
 * realistic board — the tree is already capped at two levels — and anything beyond it is a bug or an
 * abuse, not a discussion.
 */
export const MAX_MENTION_IDS = MENTION_BATCH_SIZE * 10;

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

/**
 * Build the bulk identity-read URLs for the organization that owns `href`, one per batch of ids, or
 * an empty list when there is nothing (or nowhere) to ask.
 *
 * WHY a bulk read at all: a mention is stored as a bare GUID, so rendering a board's descriptions
 * and notes one name at a time would cost a request per mentioned person, per item. Collecting every
 * GUID first and resolving them together is what keeps the whole board to one or two round-trips.
 *
 * Anything that is not a well-formed GUID is DROPPED rather than passed through. The ids arrive from
 * the content side, and they are interpolated into a query string: validating the shape here is what
 * keeps a page from steering the request somewhere else.
 */
export function buildAdoIdentityNamesUrls(href: string, ids: readonly string[]): string[] {
  const base = resolveAdoIdentityServiceBase(href);
  if (base === null) {
    return [];
  }
  const exact = new RegExp(`^${GUID_PATTERN}$`);
  const safe = [...new Set(ids.map((id) => id.trim().toLowerCase()))]
    .filter((id) => exact.test(id))
    .slice(0, MAX_MENTION_IDS);

  const urls: string[] = [];
  for (let start = 0; start < safe.length; start += MENTION_BATCH_SIZE) {
    const batch = safe.slice(start, start + MENTION_BATCH_SIZE).join(",");
    // `queryMembership=None` keeps the response to the identities themselves: the default expands
    // every group each person belongs to, which is a large body for an answer that is one name.
    urls.push(
      `${base}/_apis/identities?identityIds=${batch}` +
        `&queryMembership=None&api-version=${IDENTITIES_API_VERSION}`,
    );
  }
  return urls;
}

/** One identity as the bulk read returns it; every field is optional on the wire. */
interface RawIdentity {
  id?: unknown;
  customDisplayName?: unknown;
  providerDisplayName?: unknown;
  properties?: unknown;
}

/**
 * Parse the bulk identity bodies into display names keyed by LOWERCASE identity GUID.
 *
 * Best-effort like every other parser here: a missing or malformed body contributes nothing, so an
 * unresolvable mention renders as the neutral "@mention" label instead of breaking the view. An
 * identity with no usable name is left out for the same reason — a blank "@" is worse than the
 * placeholder.
 */
export function parseAdoIdentityNames(bodies: readonly unknown[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const body of bodies) {
    const value = (body as { value?: unknown } | null)?.value;
    if (!Array.isArray(value)) {
      continue;
    }
    for (const raw of value) {
      const identity = raw as RawIdentity | null;
      const id = typeof identity?.id === "string" ? identity.id.toLowerCase() : null;
      const name = id === null ? null : displayNameOf(identity as RawIdentity);
      if (id !== null && name !== null) {
        names.set(id, name);
      }
    }
  }
  return names;
}

/**
 * The name to show for one identity, or null when it carries none.
 *
 * A custom display name wins because that is the name the organization chose to show this person
 * under, and it is what ADO's own mention chips render; the provider name is the directory's, and
 * the sign-in account is the last resort so a mention still reads as a person rather than a GUID.
 */
function displayNameOf(identity: RawIdentity): string | null {
  const account = (identity.properties as { Account?: { $value?: unknown } } | null)?.Account
    ?.$value;
  for (const candidate of [identity.customDisplayName, identity.providerDisplayName, account]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
}
