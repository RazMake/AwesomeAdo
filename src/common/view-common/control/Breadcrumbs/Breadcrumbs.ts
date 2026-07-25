/**
 * A reusable breadcrumb trail: a row of clickable segments separated by a glyph.
 *
 * Every view renders the same "you are here" trail (a query's parent folders, a work item's
 * ancestor chain, …), so the trail lives here as a shared, theme-aware control rather than being
 * re-built per view. It is deliberately data-only: callers hand it resolved `{ label, url }`
 * segments and it never scrapes a page or knows what a segment *means*, so the same control serves
 * every view.
 */

/** One clickable segment of a breadcrumb trail. */
export interface BreadcrumbSegment {
  /** The segment's display label. */
  label: string;
  /** The absolute URL the segment navigates to when clicked. */
  url: string;
}

/** Options for rendering a breadcrumb trail. */
export interface BreadcrumbsOptions {
  /** The trail segments, ordered outermost → nearest. An empty array renders nothing. */
  segments: BreadcrumbSegment[];
  /** Accessible label for the nav landmark. Defaults to "Breadcrumb". */
  ariaLabel?: string;
  /** The glyph shown between segments. Defaults to a backslash. */
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

  const separatorGlyph = options.separator ?? "\\";

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

    const link = doc.createElement("a");
    link.className = "awesomeado-breadcrumb";
    link.textContent = segment.label;
    link.href = segment.url;
    // Themed link color so the segment reads as clickable on both light and dark themes.
    link.style.cssText = [
      "color:var(--communication-foreground, #0078d4)",
      "text-decoration:none",
      "cursor:pointer",
    ].join(";");
    nav.append(link);
  });

  return nav;
}
