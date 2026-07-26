# controlStyles

Injects a control's stylesheet into a document exactly once.

Shared view controls style themselves **inline** so Azure DevOps' stylesheet cannot restyle or hide
them. A few things cannot be expressed inline — `:hover` and shadow pseudo-elements such as
`::-webkit-calendar-picker-indicator` — and those (only those) belong in a real rule. This helper is
the single place that adds one.

## Usage

```ts
import { ensureControlStyles } from "../controlStyles/controlStyles";

const STYLE_ID = "awesomeado-eta-style";

ensureControlStyles(doc, STYLE_ID, `.awesomeado-eta__button:hover { background: #eee; }`);
```

## API

| Export                              | Description                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ensureControlStyles(doc, id, css)` | Appends a `<style id>` carrying `css` to the document, or does nothing when an element with that id is already present. |

Call it on every render: the id guard makes repeat calls free, so a control never has to track
whether its sheet was already added.
