/**
 * Turns an untrusted HTML string into DOM, keeping only what a note or a description may contain.
 *
 * WHY an allowlist rebuild rather than `innerHTML` + a blocklist: this markup comes from Azure
 * DevOps, which means it comes from whoever typed it — any teammate, and on a public project anyone
 * at all. It is rendered INSIDE the ADO page, where a single surviving event-handler attribute would
 * run against the reader's signed-in session. So nothing is ever assigned to `innerHTML` on the live
 * document: the source is parsed into an inert document (no browsing context, so no script runs and
 * no image loads while parsing), then every node is REBUILT into the live document, copying only the
 * attributes named here. Anything not on the allowlist is unwrapped (its text survives, its markup
 * does not) and script-bearing elements are dropped whole.
 */

import { buildAdoAttachmentUrl } from "../../../ado/adoAttachment";

/** The class the shared theme styles hang an `@`-mention on. */
export const MENTION_CLASS = "awesomeado-markdown__mention";

/** Elements a note or description may render. Everything else is unwrapped to its text. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "P",
  "BR",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "DEL",
  "UL",
  "OL",
  "LI",
  "A",
  "BLOCKQUOTE",
  "CODE",
  "PRE",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TD",
  "TH",
  "SPAN",
  "DIV",
  "HR",
  "IMG",
  "SUB",
  "SUP",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
]);

/**
 * Elements dropped WITH their contents, rather than unwrapped.
 *
 * Unwrapping these would be worse than useless: a `<script>`'s body is code, and showing it as text
 * dumps a wall of JavaScript into the middle of a note.
 */
const DROPPED_TAGS: ReadonlySet<string> = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "MATH",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
]);

/** Link targets that are safe to follow. `javascript:` and `data:` documents are excluded. */
const SAFE_LINK = /^(?:https?:|mailto:)/i;

/** An inline image, which carries its own bytes and so needs no resolving against a page. */
const DATA_IMAGE = /^data:image\//i;

/** The only schemes an image may be FETCHED from once its reference has been resolved. */
const FETCHABLE_IMAGE_SCHEME = /^https?:$/i;

/**
 * The attribute Azure DevOps marks an `@`-mention anchor with. Its href is a dead "#", so the anchor
 * is turned into a plain mention span — a link that goes nowhere is worse than no link.
 */
const MENTION_ATTRIBUTE = "data-vss-mention";

/**
 * Parse `html` and rebuild it as a sanitized fragment belonging to `doc`.
 *
 * `createHTMLDocument` is what makes the parse itself safe: the resulting document has no browsing
 * context, so inline scripts never execute and `<img src>` never fires a request while we inspect it.
 */
export function sanitizeRichText(doc: Document, html: string): DocumentFragment {
  const inert = doc.implementation.createHTMLDocument("");
  inert.body.innerHTML = html;
  const fragment = doc.createDocumentFragment();
  for (const child of Array.from(inert.body.childNodes)) {
    fragment.append(sanitizeNode(doc, child));
  }
  return fragment;
}

/** Rebuild one node into `doc`, returning the (possibly empty) replacement. */
function sanitizeNode(doc: Document, node: Node): Node {
  if (node.nodeType === node.TEXT_NODE) {
    return doc.createTextNode(node.nodeValue ?? "");
  }
  if (node.nodeType !== node.ELEMENT_NODE) {
    // Comments, CDATA and processing instructions carry nothing a reader needs.
    return doc.createDocumentFragment();
  }
  const element = node as Element;
  const tag = element.tagName.toUpperCase();
  if (DROPPED_TAGS.has(tag)) {
    return doc.createDocumentFragment();
  }
  const rebuilt = rebuildElement(doc, element, tag);
  for (const child of Array.from(element.childNodes)) {
    rebuilt.append(sanitizeNode(doc, child));
  }
  return rebuilt;
}

/**
 * The sanitized shell for one element: the same tag with only its allowed attributes, a mention span
 * for a mention anchor, or a bare fragment (an unwrap) for a tag that is not on the allowlist.
 */
function rebuildElement(doc: Document, element: Element, tag: string): Node & ParentNode {
  if (element.hasAttribute(MENTION_ATTRIBUTE)) {
    const mention = doc.createElement("span");
    mention.className = MENTION_CLASS;
    return mention;
  }
  if (!ALLOWED_TAGS.has(tag)) {
    return doc.createDocumentFragment();
  }
  const rebuilt = doc.createElement(tag.toLowerCase());
  copyAllowedAttributes(element, rebuilt, tag);
  return rebuilt;
}

/** Copy the few attributes each allowed tag may keep; everything else (including `on*`) is dropped. */
function copyAllowedAttributes(source: Element, target: HTMLElement, tag: string): void {
  if (tag === "A") {
    const href = (source.getAttribute("href") ?? "").trim();
    if (SAFE_LINK.test(href)) {
      target.setAttribute("href", href);
      // ADO's own page stays put and the opened tab cannot reach back through `window.opener`.
      target.setAttribute("target", "_blank");
      target.setAttribute("rel", "noopener noreferrer");
    }
    return;
  }
  if (tag === "IMG") {
    const src = resolveImageSource(source.getAttribute("src"), target.ownerDocument);
    if (src !== null) {
      // An ADO attachment is same-origin with the page this renders in, so the browser sends the
      // session with it — no proxy or token handling is needed here.
      target.setAttribute("src", src);
    }
    const alt = source.getAttribute("alt");
    if (alt !== null) {
      target.setAttribute("alt", alt);
    }
    // Never let an oversized screenshot push the board's layout sideways.
    target.style.maxWidth = "100%";
    target.style.height = "auto";
    return;
  }
  if (tag === "SPAN" && source.getAttribute("class") === MENTION_CLASS) {
    target.className = MENTION_CLASS;
  }
}

/**
 * The absolute URL an image should load from, or null when it is not safe to load at all.
 *
 * Three shapes arrive here. An inline `data:image/` carries its own bytes. An ADO ATTACHMENT — a
 * bare attachment GUID, which is how Azure DevOps renders a pasted screenshot — has to be turned
 * into the REST attachment request ADO's own UI makes, or it resolves to `{origin}/{guid}` and the
 * reader gets a broken-image box. Everything else is resolved as an ordinary reference against the
 * PAGE the note renders in (not `baseURI`, which ADO's SPA pins to `/` and which therefore throws
 * away the organization on `dev.azure.com`).
 *
 * The scheme is checked on the RESULT, so `javascript:`, `file:` and non-image `data:` references
 * are still refused rather than smuggled in by writing them relatively.
 */
function resolveImageSource(raw: string | null, doc: Document): string | null {
  const source = (raw ?? "").trim();
  if (source.length === 0) {
    return null;
  }
  if (DATA_IMAGE.test(source)) {
    // Its bytes are the reference; there is nothing to resolve.
    return source;
  }
  const pageHref = doc.defaultView?.location.href ?? doc.baseURI;
  const attachment = buildAdoAttachmentUrl(pageHref, source);
  if (attachment !== null) {
    return attachment;
  }
  try {
    const resolved = new URL(source, pageHref);
    return FETCHABLE_IMAGE_SCHEME.test(resolved.protocol) ? resolved.href : null;
  } catch {
    // An unparseable reference (a relative URL against an unparseable base) is simply not an image.
    return null;
  }
}
