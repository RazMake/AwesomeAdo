import { parseAdoContext } from "../navigation/AdoContext";

import { ADO_API_VERSION } from "./adoApi";
import { adoCollectionBaseUrl } from "./fetchAdoMetadata";

/**
 * How Azure DevOps refers to an image embedded in a note or a description: the attachment's GUID on
 * its own (optionally carrying the original file name as a query), with no host, no collection and
 * no `_apis` path at all — `4f76001f-…-b3a3f54e9a73?fileName=image.png`.
 *
 * ADO's own UI turns that into a REST attachment request before it renders the image. Anything that
 * resolves it as a plain relative URL instead gets `{origin}/{guid}` (ADO's SPA pins `<base href="/">`),
 * which is a 404 and shows the reader a broken-image box where a screenshot should be.
 */
const BARE_ATTACHMENT_REFERENCE = /^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(\?[^#]*)?$/i;

/**
 * The same reference after something has already resolved it against the collection root — the shape
 * a work item COMMENT arrives in, where ADO's own `renderedText` hands back
 * `https://{org}.visualstudio.com/{guid}?fileName=image.png`.
 *
 * That URL addresses nothing: it is the bare reference joined to the origin, which is exactly the
 * 404 above wearing a host name. It still has to become a REST attachment request, so the id is
 * taken from the last path segment.
 */
const ATTACHMENT_PATH_SEGMENT = /\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;

/**
 * An ADO "area" route (`_apis`, `_queries`, `_workitems`, …).
 *
 * A GUID at the end of one of these addresses something real and specific — a saved query, an API
 * resource — so a path containing an area token is never an unresolved attachment reference, and
 * rewriting it would break a URL that was already correct.
 */
const ADO_AREA_SEGMENT = /\/_/;

/**
 * The REST URL an attachment reference embedded in ADO rich text must be fetched from, or null when
 * `reference` is not such a reference (or `pageHref` is not an ADO page).
 *
 * Addressed at the ORGANIZATION, not the project: an attachment id is org-unique, and org-scoping
 * keeps this working on the org-level pages where no project can be resolved from the URL. The
 * `fileName` ADO puts in the reference is deliberately preserved — it is what makes the response
 * come back typed as an image rather than as an opaque download.
 */
export function buildAdoAttachmentUrl(pageHref: string, reference: string): string | null {
  const trimmed = reference.trim();
  const bare = BARE_ATTACHMENT_REFERENCE.exec(trimmed);
  if (bare !== null) {
    return attachmentRequest(pageHref, bare[1] ?? "", bare[2] ?? "");
  }
  const located = locateAttachment(pageHref, trimmed);
  return located === null ? null : attachmentRequest(located.href, located.id, located.query);
}

/**
 * The attachment an already-resolved reference points at, or null when the URL is not one.
 *
 * Resolved against the page (not `baseURI`) so a root-relative reference keeps the organization it
 * belongs to, and answered from the RESOLVED url so the request is built against the host that
 * actually holds the attachment.
 */
function locateAttachment(
  pageHref: string,
  reference: string,
): { href: string; id: string; query: string } | null {
  let resolved: URL;
  try {
    resolved = new URL(reference, pageHref);
  } catch {
    return null;
  }
  if (ADO_AREA_SEGMENT.test(resolved.pathname)) {
    return null;
  }
  const match = ATTACHMENT_PATH_SEGMENT.exec(resolved.pathname);
  if (match === null || parseAdoContext(resolved.href) === null) {
    return null;
  }
  return { href: resolved.href, id: match[1] ?? "", query: resolved.search };
}

/** The org-scoped REST request for one attachment id, or null when `contextHref` is not ADO. */
function attachmentRequest(contextHref: string, id: string, query: string): string | null {
  const context = parseAdoContext(contextHref);
  if (context === null) {
    return null;
  }
  // parseAdoContext already validated the URL, so this cannot throw.
  const page = new URL(contextHref);
  const base = adoCollectionBaseUrl(page.origin, page.hostname, context.organization);
  const separator = query.length > 0 ? "&" : "?";
  return `${base}/_apis/wit/attachments/${id}${query}${separator}api-version=${ADO_API_VERSION}`;
}
