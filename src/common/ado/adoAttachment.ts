import { parseAdoContext } from "../navigation/AdoContext";

import { ADO_API_VERSION } from "./adoApi";
import { adoCollectionBaseUrl, resolveAdoProjectContext } from "./fetchAdoMetadata";
import { asRecord, nonEmptyString } from "./rawJson";

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

/** An attachment id on its own, as an upload answers with and a delete takes. */
export const ATTACHMENT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** The api-version Azure DevOps offers the attachment delete under; it exists only as a preview. */
const ATTACHMENT_DELETE_API_VERSION = "7.2-preview.4";

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

/**
 * The URL a new attachment is uploaded to, or null when `href` is not a project-scoped ADO location.
 *
 * Project-scoped, like the request ADO's own editors make when a screenshot is pasted: the project
 * is what the attachment's storage and permissions are charged to. `uploadType=Simple` sends the
 * whole file in one request, which is what a pasted image is.
 */
export function buildAttachmentUploadUrl(href: string, fileName: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const name = encodeURIComponent(fileName);
  return (
    `${resolved.base}/${resolved.project}/_apis/wit/attachments` +
    `?fileName=${name}&uploadType=Simple&api-version=${ADO_API_VERSION}`
  );
}

/**
 * The URL Azure DevOps answered an upload with, carrying the file's name, or null when the body does
 * not carry a URL.
 *
 * That URL — not one rebuilt from the id — is what gets embedded, because it is the reference ADO's
 * own editors embed, so a description authored here reads the same when opened in ADO. The name is
 * added the way ADO adds it: it is what makes the attachment come back typed as an image rather than
 * as an opaque download.
 */
export function parseUploadedAttachmentUrl(raw: unknown, fileName: string): string | null {
  const url = nonEmptyString(asRecord(raw)?.["url"]);
  if (url === null) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return null;
  }
  parsed.searchParams.set("fileName", fileName);
  return parsed.href;
}

/**
 * The id Azure DevOps filed an upload under, or null when the body does not carry a well-formed one.
 *
 * Validated here because it is later handed back to a permanent DELETE: anything that is not a GUID
 * must never reach one.
 */
export function parseUploadedAttachmentId(raw: unknown): string | null {
  const id = nonEmptyString(asRecord(raw)?.["id"]);
  return id !== null && ATTACHMENT_ID.test(id) ? id : null;
}

/**
 * The URL an unsaved upload is removed through, or null when `href` is not a project-scoped ADO
 * location or `attachmentId` is not a GUID.
 *
 * Scoped to the same project the upload was charged to (see `buildAttachmentUploadUrl`). The delete
 * is only offered from a preview API version, so it carries its own rather than `ADO_API_VERSION`.
 */
export function buildAttachmentDiscardUrl(href: string, attachmentId: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null || !ATTACHMENT_ID.test(attachmentId)) {
    return null;
  }
  return (
    `${resolved.base}/${resolved.project}/_apis/wit/attachments/${attachmentId}` +
    `?api-version=${ATTACHMENT_DELETE_API_VERSION}`
  );
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
