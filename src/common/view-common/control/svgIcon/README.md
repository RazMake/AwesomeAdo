# svgIcon Helper

The shared inline-SVG canvas the extension's own glyphs are drawn on. A control supplies the shape;
this helper supplies the element every glyph agrees on, so glyphs stay the same size and behave the
same way from one control to the next.

## Usage

```typescript
import { createSvgCanvas } from "path/to/svgIcon";

const canvas = createSvgCanvas(document, "display:block");
const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
path.setAttribute("d", "M2 2 L14 2 L10 8 L10 14 L6 14 L6 8 Z");
// `currentColor` so the glyph flips with its control's themed text color.
path.setAttribute("fill", "currentColor");
canvas.append(path);
```

## Public API

### `createSvgCanvas(doc, css): SVGSVGElement`

- **`doc: Document`** — Document the element is created in (namespaced, so it renders as real SVG).
- **`css: string`** — Inline style for the canvas, e.g. `"display:block"` or `"display:none;flex:none"`.

Returns an empty `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">`; the caller
appends the shape.

## Features

- **One geometry for every glyph:** a 16-unit viewBox rendered at 14px, so shapes are interchangeable
  between controls and align with the 14px text beside them.
- **Decorative by default:** `aria-hidden` — a glyph's meaning comes from the labelled control that
  contains it, so screen readers are not made to announce it twice.
- **Inline, not fetched:** no network request from inside a page the extension does not own, and the
  shape can inherit `currentColor` instead of shipping one asset per theme.
