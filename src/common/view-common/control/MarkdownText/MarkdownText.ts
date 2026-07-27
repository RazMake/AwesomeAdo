import { MENTION_TOKEN_PATTERN } from "../../../ado/mentionIdentities";

import { markdownToHtml, escapeHtml } from "./markdownToHtml";
import { MENTION_CLASS, sanitizeRichText } from "./sanitizeRichText";

/**
 * What to render. `html` is Azure DevOps' own rendering of `text` and is preferred whenever it
 * exists, because that is where ADO resolves an `@`-mention to the person's name — the stored source
 * only carries their identity GUID.
 */
export interface MarkdownTextOptions {
  /** The Markdown (or ADO rich-text HTML) source. */
  text: string;
  /** ADO's rendering of `text`, when the response carried one; null falls back to rendering `text`. */
  html?: string | null;
  /**
   * Display names for the `@<guid>` mention tokens in `text`, keyed by lowercase GUID. Only consulted
   * when rendering the source; an unlisted GUID renders as a neutral "@mention" rather than exposing
   * a raw identity id to the reader.
   */
  mentionNames?: ReadonlyMap<string, string>;
}

/**
 * How Azure DevOps stores an `@`-mention inside Markdown. The shape is owned by `common/ado` (it is
 * an ADO storage detail, and the bulk resolver has to find the same tokens this renders); the regex
 * is built here rather than shared because a global one carries a mutable `lastIndex`.
 */
const MENTION_TOKEN = new RegExp(MENTION_TOKEN_PATTERN, "g");

/** The label shown for a mention whose GUID no directory answer resolved. */
const UNRESOLVED_MENTION = "mention";

/**
 * Renders Markdown / ADO rich text as safe, theme-aware DOM.
 *
 * The shared control for every place this extension shows author-written content — a work item's
 * description and every discussion note — so the rules for what may render (and what an `@`-mention
 * or an embedded screenshot looks like) live in exactly one place.
 *
 * The markup is NEVER assigned to `innerHTML` on the live page: it is parsed inert and rebuilt
 * against an allowlist by `sanitizeRichText`, because this content is written by whoever edited the
 * work item and is rendered inside the reader's signed-in ADO session.
 */
export function renderMarkdownText(doc: Document, options: MarkdownTextOptions): HTMLElement {
  const root = doc.createElement("div");
  root.className = "awesomeado-markdown";
  // Inherit the surrounding type so a note reads at the size of the row it belongs to; break long
  // unspaced tokens (a pasted URL) so they wrap instead of forcing the board to scroll sideways.
  root.style.cssText = ["font:inherit", "color:inherit", "overflow-wrap:anywhere"].join(";");

  const html =
    options.html !== undefined && options.html !== null && options.html.length > 0
      ? options.html
      : markdownToHtml(expandMentions(options.text, options.mentionNames));

  root.append(sanitizeRichText(doc, html));
  styleRenderedContent(root);
  return root;
}

/**
 * Replace each `@<guid>` token with a mention span carrying the person's name.
 *
 * The span is built here rather than left to the Markdown converter so the display name is escaped
 * exactly once, at the moment it becomes markup.
 */
function expandMentions(text: string, names: ReadonlyMap<string, string> | undefined): string {
  return text.replace(MENTION_TOKEN, (_match, guid: string) => {
    const name = names?.get(guid.toLowerCase()) ?? UNRESOLVED_MENTION;
    return `<span class="${MENTION_CLASS}">@${escapeHtml(name)}</span>`;
  });
}

/**
 * Apply the control's own look to the sanitized DOM.
 *
 * Done after the rebuild, and inline, for the same reason every other control here styles inline:
 * this renders inside ADO's page, where a class-based rule of ours is one stylesheet update away
 * from being overridden — and the sanitizer deliberately drops any `style` the source tried to set.
 */
function styleRenderedContent(root: HTMLElement): void {
  for (const mention of root.querySelectorAll<HTMLElement>(`.${MENTION_CLASS}`)) {
    // A communication-accent tint from ADO's palette, so a mention stands out on light and dark
    // themes alike without hard-coding a color that fights either one.
    mention.style.cssText = [
      "color:var(--communication-foreground, #6b9fff)",
      "font-weight:600",
    ].join(";");
  }
  for (const link of root.querySelectorAll<HTMLElement>("a")) {
    link.style.color = "var(--communication-foreground, #6b9fff)";
  }
  for (const code of root.querySelectorAll<HTMLElement>("code")) {
    code.style.cssText = [
      "font-family:monospace",
      "background:rgba(128,128,128,0.18)",
      "border-radius:3px",
      "padding:0 3px",
    ].join(";");
  }
  for (const quote of root.querySelectorAll<HTMLElement>("blockquote")) {
    quote.style.cssText = [
      "margin:4px 0",
      "padding-left:8px",
      "border-left:2px solid rgba(128,128,128,0.45)",
    ].join(";");
  }
  // ADO descriptions arrive as a stack of paragraphs; the browser default margin between them turns
  // a three-line description into a screenful.
  for (const paragraph of root.querySelectorAll<HTMLElement>("p")) {
    paragraph.style.margin = "0 0 4px 0";
  }
}
