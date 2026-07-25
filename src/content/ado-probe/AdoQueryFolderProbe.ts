/**
 * Reads the parent-folder trail of the saved query the Azure DevOps page is showing.
 *
 * The query's folder path lives only in the rendered page — ADO keeps its breadcrumb bar visible
 * above our overlay (we hide `[role="main"]`, not the breadcrumb), so the folder ancestors are right
 * there in the same document. This is a best-effort scrape like `AdoQueryNameProbe`: ADO's markup is
 * undocumented and shifts between releases, so a miss simply returns `[]` and the header hides its
 * breadcrumb row rather than showing a wrong trail.
 */

import { isAdoQueryUrl, parseAdoQueryId } from "../../common/navigation/AdoQueryRoute";

/** One clickable parent-folder segment scraped from the ADO breadcrumb bar. */
export interface AdoQueryFolderSegment {
  /** The folder's display label. */
  label: string;
  /** The absolute URL that navigates to that folder. */
  url: string;
}

// Candidate breadcrumb containers, most specific first. ADO's Bolt UI renders `.bolt-breadcrumb`;
// older/queries-hub markup uses a `.breadcrumb` element. A generic `nav[aria-label]` catches the
// accessible landmark when the class names shift again.
const BREADCRUMB_SELECTORS = [
  ".bolt-breadcrumb",
  ".queries-hub .breadcrumb",
  ".breadcrumb",
  'nav[aria-label="Breadcrumb"]',
];

function findBreadcrumb(doc: Document): Element | null {
  for (const selector of BREADCRUMB_SELECTORS) {
    const element = doc.querySelector(selector);
    if (element !== null) {
      return element;
    }
  }
  return null;
}

export function detectAdoQueryFolderPath(doc: Document): AdoQueryFolderSegment[] {
  const container = findBreadcrumb(doc);
  if (container === null) {
    return [];
  }

  const segments: AdoQueryFolderSegment[] = [];
  // ADO can render a node twice within one crumb (an icon anchor plus a text anchor to the same
  // target), so collapse by URL to one clickable segment per folder.
  const seenUrls = new Set<string>();

  for (const anchor of container.querySelectorAll("a[href]")) {
    const url = (anchor as HTMLAnchorElement).href;
    // Keep only folder/hub routes: a specific `…/_queries/query/{guid}` link is the leaf query
    // itself (never a parent folder), and any non-`_queries` crumb (e.g. the "Boards" hub) is not a
    // query folder the user asked to see.
    if (!isAdoQueryUrl(url) || parseAdoQueryId(url) !== null) {
      continue;
    }
    const label = (anchor.textContent ?? "").trim();
    if (label.length === 0 || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    segments.push({ label, url });
  }

  return segments;
}
