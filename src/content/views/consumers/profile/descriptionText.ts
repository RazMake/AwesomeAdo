/**
 * Text-level reading of a consumer description: turning whatever Azure DevOps stored into clean
 * lines, and the small line shapes (list items, `Key: value`, table rows) people write data in.
 *
 * Everything here reads; nothing renders. Results are plain text a caller sets via `textContent`.
 */

/**
 * Markup only rich-text HTML contains. A description carrying none of it is Markdown or plain text,
 * whose lines are read — and written back — exactly as stored. The tag name has to END at a space or
 * `>`, so a bracketed address such as `<a@contoso.com>` in Markdown is not taken for an anchor.
 */
const HTML_MARKUP =
  /<\/?(?:p|div|br|span|ul|ol|li|h[1-6]|strong|b|em|i|u|a|code|pre|table|tr|td|img|blockquote)(?:\s[^>]*)?\/?>/i;

/** Whether the description is Azure DevOps rich text rather than Markdown or plain text. */
export function isRichText(description: string): boolean {
  return HTML_MARKUP.test(description);
}

/**
 * The description's lines as a reader sees them, one per stored line of a Markdown description.
 *
 * Only rich text has its tags removed: in Markdown an angle-bracketed address (`<jdoe@contoso.com>`)
 * or an `@<guid>` mention is part of what was written, and stripping it as a "tag" would lose it.
 */
export function readableLines(description: string): string[] {
  const normalized = description.replace(/\r\n?/g, "\n");
  if (isRichText(normalized)) return flattenRichText(normalized).split("\n").map(cleanLine);
  // Decoded line by line, so an encoded newline (`&#10;`) never shifts a line away from its source.
  return normalized.split("\n").map((line) => cleanLine(decodeEntities(line)));
}

/**
 * One line with the invisible differences between writers removed: non-breaking and zero-width
 * spaces pasted from other editors, and the full-width colon of an IME, which every `Key: value`
 * reading would otherwise miss.
 */
function cleanLine(line: string): string {
  return line
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u00a0\u2007\u202f\t]/g, " ")
    .replace(/\uff1a/g, ":")
    .trim();
}

/** What a list item, quote, or checkbox line says, without the markers in front of it. */
const LINE_PREFIX =
  /^(?:>\s*|(?:[-*+\u2022\u00b7\u25aa\u25e6\u2023]|\d{1,3}[.)]|[a-z][.)])\s+|\[[ xX]\]\s+)/;

/** A list item's text, or the line itself when it is not one; nested markers are all removed. */
export function listItemBodyOf(line: string): string {
  let body = line;
  for (let match = LINE_PREFIX.exec(body); match !== null; match = LINE_PREFIX.exec(body)) {
    body = body.slice(match[0].length).trimStart();
  }
  return body;
}

/** Whether a line is a list item, quote, or checkbox rather than a paragraph. */
export function isListItem(line: string): boolean {
  return LINE_PREFIX.test(line);
}

/** `Key: value` or `Key = value`, with a key short enough that a sentence is never one. */
const KEYED_LINE = /^([^:=]{1,40}?)\s*[:=]\s*(.+)$/;
/** A key that is really the start of a link: `https://…`, `[Jane](mailto:…)`. */
const LINK_SCHEME_KEY = /(?:^|[^a-z])(?:https?|ftp|mailto)$/i;

/** A `Key: value` line, both sides stripped of their Markdown decoration (`rawValue` is not). */
export function keyedLineOf(body: string): { key: string; value: string; rawValue: string } | null {
  const match = KEYED_LINE.exec(body);
  const rawKey = match?.[1] ?? "";
  if (match === null || LINK_SCHEME_KEY.test(rawKey)) return null;
  const key = plainText(rawKey);
  const rawValue = match[2] ?? "";
  return key.length === 0 ? null : { key, value: plainText(rawValue), rawValue };
}

/** The cells of a Markdown table row, or null when the line is not one. */
export function tableCellsOf(line: string): string[] | null {
  if (!line.startsWith("|")) return null;
  const cells = line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.length > 0 ? cells : null;
}

/** The `|---|:---:|` row under a table's header. */
const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?$/;
/** A horizontal rule, or the `===` / `---` underline of a heading. */
const RULE = /^([-*_=])(?:\s*\1){1,}$/;

/** Whether `line` is the `|---|---|` row that makes the table row above it a header. */
export function isTableSeparator(line: string | undefined): boolean {
  return line !== undefined && line.includes("-") && TABLE_SEPARATOR.test(line);
}

/** Whether a line only draws something (a rule, an underline, a table's separator). */
export function isDecorativeLine(line: string): boolean {
  return RULE.test(line) || isTableSeparator(line);
}

/** Whether `line` is the `===` / `---` underline that makes the line above it a heading. */
export function isHeadingUnderline(line: string | undefined): boolean {
  return line !== undefined && /^(?:={2,}|-{2,})$/.test(line);
}

/** How a key is compared: case, spacing, and punctuation are the writer's, not the reader's. */
export function normalizeKey(text: string): string {
  return plainText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** The words in `text`, for telling a short label or name from a sentence. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * The readable text behind a span of Markdown.
 *
 * Only PAIRED emphasis is removed, so an underscore inside an alias (`first_last`) survives while
 * the italics around one (`_alias_`) do not.
 */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/(^|[^\w])[*_]([^*_\s][^*_]*?)[*_](?=[^\w]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

/**
 * Reduce rich-text HTML to text lines.
 *
 * It is rewritten into the same Markdown shapes the reader already handles (headings, list items,
 * links, bold) rather than being stripped to bare words, because that structure is exactly what
 * says which value is which.
 */
function flattenRichText(source: string): string {
  const withLinks = source.replace(
    /<a\b[^>]*\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (
      _match,
      quoted: string | undefined,
      single: string | undefined,
      bare: string | undefined,
      text: string,
    ) => `[${stripTags(text)}](${quoted ?? single ?? bare ?? ""})`,
  );
  return decodeEntities(
    withLinks
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<h([1-6])\b[^>]*>/gi, (_match, level: string) => `\n${"#".repeat(Number(level))} `)
      .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|blockquote|section)\b[^>]*>/gi, "\n")
      .replace(/<\/?(?:strong|b)\s*>/gi, "**")
      .replace(/<\/?(?:code|tt|samp)\s*>/gi, "`")
      .replace(/<[^>]*>/g, ""),
  );
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

/** The entities ADO's editor emits; an unknown one is left as written rather than guessed at. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const name = entity.toLowerCase();
    if (name.startsWith("#x")) return codePointText(Number.parseInt(name.slice(2), 16), match);
    if (name.startsWith("#")) return codePointText(Number(name.slice(1)), match);
    return NAMED_ENTITIES[name] ?? match;
  });
}

function codePointText(value: number, fallback: string): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : fallback;
}
