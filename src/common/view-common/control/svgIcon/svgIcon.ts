/** The SVG namespace `document.createElementNS` needs; a plain `createElement` yields an inert node. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Creates the inline SVG canvas the extension's own glyphs are drawn on.
 *
 * Glyphs are drawn inline rather than fetched so they inherit `currentColor` (one shape that reads on
 * every ADO theme) and cost no network request inside a page the extension does not own. Every glyph
 * shares one 16-unit viewBox rendered at 14px so shapes stay interchangeable between controls and
 * line up with the 14px text they sit beside. `aria-hidden` because a glyph is always decorative
 * here — its meaning comes from the labelled control that contains it.
 */
export function createSvgCanvas(doc: Document, css: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = css;
  return svg;
}
