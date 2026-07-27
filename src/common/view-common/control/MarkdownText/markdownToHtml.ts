/**
 * Converts the Markdown subset Azure DevOps notes and descriptions are written in into an HTML
 * string, ready for `sanitizeRichText` to turn into DOM.
 *
 * WHY a hand-written converter rather than a library: this runs inside a content script injected on
 * every ADO page, so every kilobyte is paid for on pages that never render a note — and the input is
 * not arbitrary Markdown but the narrow subset ADO's own editors produce. The output is NEVER
 * trusted: it is always handed to `sanitizeRichText`, which is what makes passing raw HTML through
 * safe (see below) rather than a scripting hole.
 *
 * Raw HTML lines pass through deliberately. An ADO rich-text field (`System.Description` and any
 * note posted before the project moved to Markdown) arrives as HTML, and escaping it would show a
 * reader their description's markup instead of their description.
 */

/** The private markers protecting a span from later rewrites. `\u0000` cannot occur in real text. */
const MARKER_START = "\u0000";
const MARKER_END = "\u0000";

/** A line that opens or closes a fenced code block. */
const FENCE = /^```/;

/** Matches a Markdown heading and captures its level and text. */
const HEADING = /^(#{1,6})\s+(.*)$/;

/** Matches a horizontal rule (three or more dashes, underscores or asterisks). */
const HORIZONTAL_RULE = /^(?:---+|___+|\*\*\*+)$/;

/** Matches an unordered list item and captures its text. */
const UNORDERED_ITEM = /^[-*+]\s+(.*)$/;

/** Matches an ordered list item and captures its text. */
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;

/** Matches a line that is already HTML, which is passed through untouched (see the file comment). */
const RAW_HTML_LINE = /^<\/?[a-zA-Z]/;

/** Convert a Markdown (or already-HTML) source string into an HTML string. */
export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  const paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      // Single newlines inside a paragraph are line breaks, not word joins: a note's author pressed
      // Enter to start a new line and expects to see one.
      blocks.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
      paragraph.length = 0;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (FENCE.test(line.trim())) {
      flushParagraph();
      index = appendCodeBlock(lines, index, blocks);
      continue;
    }
    if (appendListItem(line, blocks, flushParagraph)) {
      continue;
    }
    appendLine(line, blocks, paragraph, flushParagraph);
  }

  flushParagraph();
  return blocks.join("\n");
}

/**
 * Appends one non-list, non-fence line.
 *
 * Kept separate from the main loop so the loop reads as the kinds of line it can meet rather than as
 * one long branch chain.
 */
function appendLine(
  line: string,
  blocks: string[],
  paragraph: string[],
  flushParagraph: () => void,
): void {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    flushParagraph();
    return;
  }
  const heading = HEADING.exec(trimmed);
  if (heading) {
    flushParagraph();
    const level = heading[1]?.length ?? 1;
    blocks.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
    return;
  }
  if (HORIZONTAL_RULE.test(trimmed)) {
    flushParagraph();
    blocks.push("<hr>");
    return;
  }
  if (trimmed.startsWith("> ")) {
    flushParagraph();
    blocks.push(`<blockquote>${renderInline(trimmed.slice(2))}</blockquote>`);
    return;
  }
  if (RAW_HTML_LINE.test(trimmed)) {
    // Already HTML (an ADO rich-text field): pass it straight to the sanitizer, which is what
    // decides whether any of it may render.
    flushParagraph();
    blocks.push(line);
    return;
  }
  paragraph.push(trimmed);
}

/**
 * Appends one list item, opening a list or joining the one already open. Returns false when the line
 * is not a list item at all.
 */
function appendListItem(line: string, blocks: string[], flushParagraph: () => void): boolean {
  const trimmed = line.trim();
  const unordered = UNORDERED_ITEM.exec(trimmed);
  const ordered = unordered ? null : ORDERED_ITEM.exec(trimmed);
  const match = unordered ?? ordered;
  if (match === null) {
    return false;
  }
  flushParagraph();
  appendItemToList(blocks, unordered ? "ul" : "ol", `<li>${renderInline(match[1] ?? "")}</li>`);
  return true;
}

/**
 * Puts `item` inside the list block already at the end of `blocks`, or starts a new one.
 *
 * Consecutive items MUST join the open list; each starting its own would render a bulleted line per
 * item with a gap between every one of them.
 */
function appendItemToList(blocks: string[], tag: string, item: string): void {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const last = blocks[blocks.length - 1];
  if (last !== undefined && last.startsWith(open) && last.endsWith(close)) {
    blocks[blocks.length - 1] = last.slice(0, -close.length) + item + close;
    return;
  }
  blocks.push(open + item + close);
}

/**
 * Appends a fenced code block and returns the index of its closing fence (or of the last line when
 * the fence was never closed, so an unterminated block ends the document instead of looping).
 */
function appendCodeBlock(lines: string[], start: number, blocks: string[]): number {
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length && !FENCE.test((lines[index] ?? "").trim())) {
    body.push(lines[index] ?? "");
    index += 1;
  }
  // Escaped, unlike every other line: code is quoted verbatim by definition, so markup inside it is
  // content to show, never markup to render.
  blocks.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
  return index;
}

/**
 * Applies the inline rules to one line.
 *
 * Code spans, images and links are lifted out behind private markers FIRST so the emphasis rules can
 * never rewrite the characters inside a URL (an underscore in a path is not italics) or inside code.
 */
function renderInline(text: string): string {
  const protectedSpans: string[] = [];
  const protect = (html: string): string =>
    `${MARKER_START}P${protectedSpans.push(html) - 1}${MARKER_END}`;

  let result = text.replace(/`([^`]+)`/g, (_match, code: string) =>
    protect(`<code>${escapeHtml(code)}</code>`),
  );
  result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt: string, url: string) =>
    protect(`<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}">`),
  );
  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) =>
    protect(`<a href="${escapeAttribute(url)}">${applyEmphasis(label)}</a>`),
  );
  result = applyEmphasis(result);
  return result.replace(
    new RegExp(`${MARKER_START}P(\\d+)${MARKER_END}`, "g"),
    (_match, index: string) => protectedSpans[Number(index)] ?? "",
  );
}

/** Bold, italic, strikethrough and underline, in the forms ADO's editors emit. */
function applyEmphasis(text: string): string {
  return text
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+?)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+?)~~/g, "<del>$1</del>")
    .replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>")
    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?=[^\w]|$)/g, "$1<em>$2</em>");
}

/** Escape text destined for an HTML text node. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape a value destined for a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
