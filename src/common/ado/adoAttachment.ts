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
const ATTACHMENT_REFERENCE = /^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(\?[^#]*)?$/i;

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
  const match = ATTACHMENT_REFERENCE.exec(reference.trim());
  if (match === null) {
    return null;
  }
  const context = parseAdoContext(pageHref);
  if (context === null) {
    return null;
  }
  // parseAdoContext already validated the URL, so this cannot throw.
  const page = new URL(pageHref);
  const base = adoCollectionBaseUrl(page.origin, page.hostname, context.organization);
  const query = match[2] ?? "";
  const separator = query.length > 0 ? "&" : "?";
  return `${base}/_apis/wit/attachments/${match[1]}${query}${separator}api-version=${ADO_API_VERSION}`;
}
