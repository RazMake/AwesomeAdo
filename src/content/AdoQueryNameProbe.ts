/**
 * Reads the display name of the saved query the Azure DevOps page is showing.
 *
 * The query id lives in the URL, but its human-readable name only exists in the rendered page, so
 * this is a best-effort scrape: ADO's markup is undocumented and shifts between releases. We probe a
 * few stable-ish signals for a query-title element first, then fall back to the browser tab title
 * (which ADO sets to the query name for a saved query). Any failure returns null so callers can show
 * the GUID instead of a wrong name.
 */

// Leading tab-title segments that are section labels, not a specific query name. Compared
// lower-cased so an unrelated page (the query folder list, a board, etc.) never yields a fake name.
const GENERIC_TITLE_SEGMENTS = new Set([
  "queries",
  "boards",
  "azure devops",
  "dashboards",
  "work items",
  "repos",
  "pipelines",
]);

// ADO joins tab-title segments with a hyphen or, depending on build/locale, one of these separators.
const TITLE_SEPARATOR = /\s+[-‹|·—]\s+/;

export function detectAdoQueryName(doc: Document): string | null {
  return readFromDom(doc) ?? readFromTitle(doc.title);
}

function readFromDom(doc: Document): string | null {
  // Probe a few candidate query-title elements, most specific first. Each match is best-effort; a
  // miss simply falls through to the tab title.
  const selectors = [
    '[aria-label="Query name"]',
    ".query-title-container .title-m",
    ".queries-hub .breadcrumb-current",
  ];
  for (const selector of selectors) {
    const text = readText(doc.querySelector(selector));
    if (text !== null) {
      return text;
    }
  }
  return null;
}

function readText(element: Element | null): string | null {
  if (element === null) {
    return null;
  }
  const value = element instanceof HTMLInputElement ? element.value : (element.textContent ?? "");
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFromTitle(title: string): string | null {
  const first = title.split(TITLE_SEPARATOR)[0]?.trim() ?? "";
  if (first.length === 0 || GENERIC_TITLE_SEGMENTS.has(first.toLowerCase())) {
    return null;
  }
  return first;
}
