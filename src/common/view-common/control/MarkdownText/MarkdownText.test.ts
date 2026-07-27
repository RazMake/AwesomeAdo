import { describe, expect, it } from "vitest";

import { renderMarkdownText } from "./MarkdownText";
import { markdownToHtml } from "./markdownToHtml";
import { MENTION_CLASS, sanitizeRichText } from "./sanitizeRichText";

describe("markdownToHtml", () => {
  it("wraps plain lines in a paragraph and joins soft breaks with <br>", () => {
    expect(markdownToHtml("first\nsecond")).toBe("<p>first<br>second</p>");
  });

  it("starts a new paragraph at a blank line", () => {
    expect(markdownToHtml("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
  });

  it("renders headings at their level", () => {
    expect(markdownToHtml("### Deep")).toBe("<h3>Deep</h3>");
  });

  it("renders a horizontal rule", () => {
    expect(markdownToHtml("---")).toBe("<hr>");
  });

  it("renders a blockquote", () => {
    expect(markdownToHtml("> quoted")).toBe("<blockquote>quoted</blockquote>");
  });

  it("collects consecutive bullets into one list", () => {
    expect(markdownToHtml("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("collects consecutive numbered items into one ordered list", () => {
    expect(markdownToHtml("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("separates a bullet list from a following numbered list", () => {
    expect(markdownToHtml("- a\n1. b")).toBe("<ul><li>a</li></ul>\n<ol><li>b</li></ol>");
  });

  it("renders emphasis, strong and strikethrough", () => {
    expect(markdownToHtml("*i* **b** ~~s~~")).toBe(
      "<p><em>i</em> <strong>b</strong> <del>s</del></p>",
    );
  });

  it("renders a link", () => {
    expect(markdownToHtml("[docs](https://example.com)")).toBe(
      '<p><a href="https://example.com">docs</a></p>',
    );
  });

  it("leaves an underscore inside a link URL alone", () => {
    expect(markdownToHtml("[x](https://example.com/a_b_c)")).toBe(
      '<p><a href="https://example.com/a_b_c">x</a></p>',
    );
  });

  it("renders an image", () => {
    expect(markdownToHtml("![shot](https://example.com/a.png)")).toBe(
      '<p><img src="https://example.com/a.png" alt="shot"></p>',
    );
  });

  it("escapes markup inside an inline code span", () => {
    expect(markdownToHtml("`<b>`")).toBe("<p><code>&lt;b&gt;</code></p>");
  });

  it("escapes markup inside a fenced code block", () => {
    expect(markdownToHtml("```\n<script>\n```")).toBe("<pre><code>&lt;script&gt;</code></pre>");
  });

  it("closes an unterminated fence at the end of the source", () => {
    expect(markdownToHtml("```\nstill open")).toBe("<pre><code>still open</code></pre>");
  });

  it("passes an HTML line through untouched, because ADO rich text arrives as HTML", () => {
    expect(markdownToHtml("<div>already html</div>")).toBe("<div>already html</div>");
  });

  it("returns nothing for empty input", () => {
    expect(markdownToHtml("")).toBe("");
  });
});

/** Sanitize `html` and return the resulting markup, so assertions read against real output. */
function sanitizedHtml(html: string): string {
  const holder = document.createElement("div");
  holder.append(sanitizeRichText(document, html));
  return holder.innerHTML;
}

/**
 * Run `render` as though the test document were the ADO page at `href`.
 *
 * jsdom serves every test from one fixed URL, but resolving an attachment is decided by WHICH ADO
 * page the note renders in, so the window's location is stood in for rather than navigated to.
 */
function onAdoPage<T>(href: string, render: () => T): T {
  Object.defineProperty(document, "defaultView", {
    value: { location: { href } },
    configurable: true,
  });
  try {
    return render();
  } finally {
    // Deleting the own property restores the real accessor from Document.prototype.
    delete (document as unknown as { defaultView?: unknown }).defaultView;
  }
}

describe("sanitizeRichText \u2014 what may render", () => {
  it("keeps allowed formatting elements", () => {
    expect(sanitizedHtml("<p><strong>hi</strong></p>")).toBe("<p><strong>hi</strong></p>");
  });

  it("drops a script element and its contents", () => {
    expect(sanitizedHtml("<p>before</p><script>alert(1)</script>")).toBe("<p>before</p>");
  });

  it("drops a style element and its contents", () => {
    expect(sanitizedHtml("<style>body{display:none}</style>ok")).toBe("ok");
  });

  it("drops an iframe", () => {
    expect(sanitizedHtml('<iframe src="https://evil.example"></iframe>')).toBe("");
  });

  it("strips every event handler attribute", () => {
    expect(sanitizedHtml('<p onclick="alert(1)">text</p>')).toBe("<p>text</p>");
  });

  it("strips a style attribute", () => {
    expect(sanitizedHtml('<p style="position:fixed">text</p>')).toBe("<p>text</p>");
  });

  it("refuses a javascript: link but keeps its text", () => {
    expect(sanitizedHtml('<a href="javascript:alert(1)">click</a>')).toBe("<a>click</a>");
  });

  it("keeps an https link and makes it open safely in a new tab", () => {
    expect(sanitizedHtml('<a href="https://example.com">go</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">go</a>',
    );
  });

  it("keeps a mailto link", () => {
    expect(sanitizedHtml('<a href="mailto:a@b.com">mail</a>')).toContain('href="mailto:a@b.com"');
  });

  it("unwraps an unknown element but keeps its text", () => {
    expect(sanitizedHtml("<marquee>still here</marquee>")).toBe("still here");
  });

  it("drops an HTML comment", () => {
    expect(sanitizedHtml("<!-- secret -->visible")).toBe("visible");
  });
});

describe("sanitizeRichText \u2014 where an image is loaded from", () => {
  it("keeps an ADO attachment image source", () => {
    const url = "https://dev.azure.com/org/proj/_apis/wit/attachments/abc";
    expect(sanitizedHtml(`<img src="${url}" alt="shot">`)).toContain(`src="${url}"`);
  });

  it("resolves a page-relative ADO attachment against the page the note renders in", () => {
    // This is the form ADO's own rendering uses, and dropping it left a note showing an empty box
    // where the author had pasted a screenshot.
    const html = sanitizedHtml('<img src="/org/proj/_apis/wit/attachments/abc" alt="Image">');

    expect(html).toContain(
      `src="${new URL("/org/proj/_apis/wit/attachments/abc", document.baseURI).href}"`,
    );
  });

  it("turns a bare attachment reference into an ADO attachment request", () => {
    // What ADO's own rendering emits for a pasted screenshot: the attachment's id and nothing else.
    const html = onAdoPage("https://contoso.visualstudio.com/proj/_queries/query/q1", () =>
      sanitizedHtml(
        '<img src="4f76001f-8f25-4e7e-80a1-b3a3f54e9a73?fileName=image.png" alt="Image">',
      ),
    );

    expect(html).toContain(
      'src="https://contoso.visualstudio.com/_apis/wit/attachments/' +
        '4f76001f-8f25-4e7e-80a1-b3a3f54e9a73?fileName=image.png&amp;api-version=7.1"',
    );
  });

  it("rebuilds the attachment URL ADO's comment rendering joins to the org root", () => {
    // A NOTE arrives as ADO's own `renderedText`, which has already glued the bare reference onto
    // the origin — a URL that addresses nothing and rendered as an empty box in every note.
    const html = onAdoPage("https://contoso.visualstudio.com/proj/_queries/query/q1", () =>
      sanitizedHtml(
        '<img src="https://contoso.visualstudio.com/4f76001f-8f25-4e7e-80a1-b3a3f54e9a73' +
          '?fileName=image.png" alt="Image">',
      ),
    );

    expect(html).toContain(
      'src="https://contoso.visualstudio.com/_apis/wit/attachments/' +
        '4f76001f-8f25-4e7e-80a1-b3a3f54e9a73?fileName=image.png&amp;api-version=7.1"',
    );
  });

  it("refuses a javascript: image source even though it is written relatively", () => {
    expect(sanitizedHtml('<img src="javascript:alert(1)" alt="x">')).not.toContain("src=");
  });
  it("refuses an image with no source at all", () => {
    expect(sanitizedHtml('<img alt="x">')).not.toContain("src=");
  });

  it("refuses a non-image data URL on an img", () => {
    expect(sanitizedHtml('<img src="data:text/html,<script>alert(1)</script>">')).not.toContain(
      "src=",
    );
  });
});

describe("sanitizeRichText \u2014 ADO's own mention markup", () => {
  it("turns an ADO mention anchor into a mention span", () => {
    const html = sanitizedHtml(
      '<a href="#" data-vss-mention="version:2.0,11111111-2222-3333-4444-555555555555">@Ada</a>',
    );
    expect(html).toBe(`<span class="${MENTION_CLASS}">@Ada</span>`);
  });
});

describe("renderMarkdownText", () => {
  it("renders the source when ADO supplied no rendering", () => {
    const element = renderMarkdownText(document, { text: "**bold**" });
    expect(element.querySelector("strong")?.textContent).toBe("bold");
  });

  it("prefers ADO's own rendering, which is where mentions carry names", () => {
    const element = renderMarkdownText(document, {
      text: "@<11111111-2222-3333-4444-555555555555>",
      html: '<p><a href="#" data-vss-mention="version:2.0,11111111-2222-3333-4444-555555555555">@Ada Lovelace</a></p>',
    });
    expect(element.querySelector(`.${MENTION_CLASS}`)?.textContent).toBe("@Ada Lovelace");
  });

  it("falls back to the source when the supplied rendering is empty", () => {
    const element = renderMarkdownText(document, { text: "plain", html: "" });
    expect(element.textContent).toBe("plain");
  });

  it("resolves a markdown mention token to the person's name", () => {
    const element = renderMarkdownText(document, {
      text: "ping @<11111111-2222-3333-4444-555555555555> please",
      mentionNames: new Map([["11111111-2222-3333-4444-555555555555", "Ada Lovelace"]]),
    });
    expect(element.querySelector(`.${MENTION_CLASS}`)?.textContent).toBe("@Ada Lovelace");
  });

  it("shows a neutral label rather than a raw identity id for an unresolved mention", () => {
    const element = renderMarkdownText(document, {
      text: "@<11111111-2222-3333-4444-555555555555>",
    });
    const mention = element.querySelector(`.${MENTION_CLASS}`);
    expect(mention?.textContent).toBe("@mention");
    expect(element.textContent).not.toContain("11111111");
  });

  it("writes a mention in purple and bold, in none of the ways a link is written", () => {
    const element = renderMarkdownText(document, {
      text: "ping @<11111111-2222-3333-4444-555555555555> and see [the docs](https://example.com)",
      mentionNames: new Map([["11111111-2222-3333-4444-555555555555", "Ada Lovelace"]]),
    });

    const mention = element.querySelector<HTMLElement>(`.${MENTION_CLASS}`)!;
    const link = element.querySelector<HTMLElement>("a")!;
    // A mention names a person, not a destination: it must not be a link, nor be dressed as one.
    expect(mention.tagName).toBe("SPAN");
    expect(mention.style.fontWeight).toBe("700");
    expect(mention.style.textDecoration).toBe("none");
    expect(mention.style.color).not.toBe(link.style.color);
    // Whichever of the two color declarations the browser kept, both are built on the same purple,
    // so a mention is never left wearing the surrounding prose's color.
    expect(mention.style.color.toLowerCase()).toContain("8a63d2");
  });

  it("escapes a display name that itself contains markup", () => {
    const element = renderMarkdownText(document, {
      text: "@<11111111-2222-3333-4444-555555555555>",
      mentionNames: new Map([["11111111-2222-3333-4444-555555555555", "<script>x</script>"]]),
    });
    expect(element.querySelector("script")).toBeNull();
    expect(element.textContent).toContain("<script>x</script>");
  });

  it("renders an embedded ADO attachment image", () => {
    const url = "https://dev.azure.com/org/proj/_apis/wit/attachments/abc";
    const element = renderMarkdownText(document, { text: `![shot](${url})` });
    const image = element.querySelector("img");
    expect(image?.getAttribute("src")).toBe(url);
    expect(image?.style.maxWidth).toBe("100%");
  });

  it("never lets a script in the source reach the live document", () => {
    const element = renderMarkdownText(document, {
      text: "<div>hi</div><script>alert(1)</script><img src=x onerror=alert(1)>",
    });
    expect(element.querySelector("script")).toBeNull();
    expect(element.querySelector("img")?.hasAttribute("onerror")).toBe(false);
  });
});
