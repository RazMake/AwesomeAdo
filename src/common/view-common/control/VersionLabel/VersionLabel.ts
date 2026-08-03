/**
 * The extension's Edge Add-ons listing, where the version marker leads.
 *
 * The product id is safe to carry in source: it identifies a PUBLISHED listing, not a user and not
 * an install. It is already in the listing's own public URL and in every user's `edge://extensions`,
 * and it is a CI secret only because it sits beside the actual publishing credentials.
 *
 * The bare-id form resolves without a name slug, so renaming the extension cannot break this link.
 */
const LISTING_URL =
  "https://microsoftedge.microsoft.com/addons/detail/hecfalbmicpkbklpfhipflpopnaikfbb";

/**
 * How much clear space the marker needs beside a neighbouring control, in pixels.
 *
 * Sat flush against the ordering glyph the two read as one control, and the marker is nothing of the
 * kind — it is a link off to the store, not something that changes what the board shows.
 */
export const VERSION_MARKER_GAP_PX = 16;

/** Render the compact extension version marker shared by enhanced-view headers. */
export function renderVersionLabel(doc: Document, version: string): HTMLAnchorElement {
  const label = doc.createElement("a");
  label.className = "awesomeado-version";
  label.href = LISTING_URL;
  // The marker is injected into ADO's page, so the opened tab must not be able to reach back into it.
  label.target = "_blank";
  label.rel = "noopener noreferrer";
  label.title = "AwesomeADO on the Microsoft Edge Add-ons store";
  label.style.cssText = [
    "display:inline-flex",
    "align-items:baseline",
    "font-size:11px",
    "line-height:1",
    "color:var(--text-secondary-color)",
    "opacity:0.72",
    "font-variant-numeric:tabular-nums",
    "white-space:nowrap",
    "cursor:pointer",
    // A dashed underline is this codebase's "quietly clickable" idiom (see a note's author name); a
    // link with no affordance at all reads as plain text and never gets clicked.
    "text-decoration:underline dashed",
    "text-underline-offset:2px",
  ].join(";");

  // Only Major.Minor is shown: this repo publishes a Major.Minor release to the stores, while the
  // build segment is CI's own run counter and names no version anyone can install or report against.
  const [major = "0", minor = "0"] = version.split(".");
  const baseVersion = `${major}.${minor}`;
  const base = doc.createElement("strong");
  base.textContent = baseVersion;
  base.style.fontWeight = "600";

  label.setAttribute("aria-label", `AwesomeADO version ${baseVersion} — open the store listing`);
  label.append("v ", base);
  return label;
}
