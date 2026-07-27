# MarkdownText

Renders author-written work item content — a description or a discussion note — as safe,
theme-aware DOM.

Use it anywhere this extension shows text a person typed into Azure DevOps. It accepts the Markdown
(or rich-text HTML) source, prefers ADO's own rendering when the response supplied one, resolves
`@`-mentions, and displays embedded images.

## Usage

```ts
import { renderMarkdownText } from "../../common/view-common/control/MarkdownText/MarkdownText";

panel.append(
  renderMarkdownText(doc, {
    text: note.text,
    html: note.renderedHtml,
  }),
);
```

## Options

| Option         | Type                          | Meaning                                                                                                             |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `text`         | `string`                      | The Markdown or ADO rich-text HTML source.                                                                          |
| `html`         | `string \| null` (optional)   | ADO's own rendering of `text`. Preferred when present — it is where ADO resolves an `@`-mention to a person's name. |
| `mentionNames` | `ReadonlyMap<string, string>` | Display names for the `@<guid>` tokens in `text`, keyed by lowercase GUID. Only used when rendering the source.     |

An `@<guid>` with no entry in `mentionNames` renders as a neutral `@mention` rather than exposing a
raw identity id. Fill the map from an
[`IMentionDirectory`](../../../ado/IMentionDirectory.ts) — collect the mentions across everything you
are about to render and resolve them in ONE bulk call, then hand this control the resolved map.

Returns a `<div class="awesomeado-markdown">` containing the rendered content.

## What it renders

- **Markdown**: headings, bullet and numbered lists, blockquotes, horizontal rules, fenced and inline
  code, links, images, bold, italic, strikethrough.
- **Rich-text HTML**: an ADO `System.Description` (or an HTML-format note) passes through the same
  allowlist, so existing items render as they do in ADO.
- **Images**: ADO attachment images load directly. The view runs inside the ADO page, so an
  attachment URL is same-origin and the browser sends the signed-in session with it. ADO refers to a
  pasted screenshot by its bare attachment id — and, in a comment's own rendering, by that id already
  glued to the origin — and both are turned into the same REST attachment request ADO's own UI
  makes; any other source is resolved against the page the note renders in.
- **`@`-mentions**: ADO's mention anchors (`data-vss-mention`) and Markdown `@<guid>` tokens both
  render as a **purple, bold** `@Name` — a `<span>`, never a link, and never wearing the link color:
  a mention names a person, not a destination, and dressing it as a link makes it read as one that
  refuses to open. The purple is nudged toward the surrounding theme's own polarity so it stays
  legible on every ADO theme, with a flat purple behind it for browsers without `color-mix`.

## What it will not render

Anything outside the allowlist is stripped: `<script>`, `<style>`, `<iframe>`, form controls, event
handler attributes, `style` attributes, and `javascript:` links. The source is parsed into an inert
document and rebuilt node by node — nothing is ever assigned to `innerHTML` on the live page.
