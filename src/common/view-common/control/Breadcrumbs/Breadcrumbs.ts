/**
 * A reusable breadcrumb trail: a row of clickable segments separated by a glyph.
 *
 * Every view renders the same "you are here" trail (a query's parent folders, a work item's
 * ancestor chain, …), so the trail lives here as a shared, theme-aware control rather than being
 * re-built per view. It is deliberately data-only: callers hand it resolved `{ label, url }`
 * segments and it never scrapes a page or knows what a segment *means*, so the same control serves
 * every view.
 */

/** One segment of a breadcrumb trail. */
export interface BreadcrumbSegment {
  /** The segment's display label. */
  label: string;
  /**
   * The absolute URL the segment navigates to when clicked. Optional: when omitted the segment
   * renders as plain, non-clickable text — used for trails whose folders have no reliable link
   * target (e.g. a query's folder path, where ADO exposes no per-folder navigation URL).
   */
  url?: string;
}

/** Options for rendering a breadcrumb trail. */
export interface BreadcrumbsOptions {
  /** The trail segments, ordered outermost → nearest. An empty array renders nothing. */
  segments: BreadcrumbSegment[];
  /** Accessible label for the nav landmark. Defaults to "Breadcrumb". */
  ariaLabel?: string;
  /** The glyph shown between segments. Defaults to a forward slash (matching ADO's path style). */
  separator?: string;
}

/**
 * Builds the breadcrumb `nav`, or null when there are no segments to show so the caller can omit the
 * row entirely rather than mount an empty landmark.
 */
export function renderBreadcrumbs(doc: Document, options: BreadcrumbsOptions): HTMLElement | null {
  const { segments } = options;
  if (segments.length === 0) {
    return null;
  }

  const separatorGlyph = options.separator ?? "/";

  const nav = doc.createElement("nav");
  nav.className = "awesomeado-breadcrumbs";
  nav.setAttribute("aria-label", options.ariaLabel ?? "Breadcrumb");
  // Muted, small trail so it reads as secondary "you are here" context on either theme.
  nav.style.cssText = [
    "display:flex",
    "align-items:center",
    "flex-wrap:wrap",
    "gap:4px",
    "font-size:10px",
    "color:var(--text-secondary-color, #8a8886)",
  ].join(";");

  segments.forEach((segment, index) => {
    if (index > 0) {
      const separator = doc.createElement("span");
      separator.className = "awesomeado-breadcrumb-sep";
      separator.textContent = separatorGlyph;
      // Decorative: the anchors already convey the trail to assistive tech.
      separator.setAttribute("aria-hidden", "true");
      separator.style.opacity = "0.6";
      nav.append(separator);
    }

    // A segment with a URL is a link; one without renders as plain text (same class, so the trail
    // reads uniformly) because not every trail has a navigable target for each folder.
    const isLink = segment.url !== undefined;
    const segmentEl = doc.createElement(isLink ? "a" : "span");
    segmentEl.className = "awesomeado-breadcrumb";
    segmentEl.textContent = segment.label;
    if (segment.url !== undefined) {
      (segmentEl as HTMLAnchorElement).href = segment.url;
    }
    // Themed foreground so the trail reads on both light and dark themes; only a real link is styled
    // (and hinted) as clickable.
    segmentEl.style.cssText = [
      "color:var(--communication-foreground, #0078d4)",
      "text-decoration:none",
      isLink ? "cursor:pointer" : "cursor:default",
    ].join(";");
    nav.append(segmentEl);
  });

  return nav;
}
