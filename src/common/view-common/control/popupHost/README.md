# popupHost Helper

Shared lazy-popup lifecycle for popup controls. It wires a trigger element to a popup that is built
on open, removed on close, and dismissed by an outside click or Escape. It manages the document-level
listeners and the popup element; the control supplies only how to build the popup's contents.

## Usage

```typescript
import { createPopupHost } from "path/to/popupHost";

const host = createPopupHost({
  doc: document,
  trigger: badgeButton,
  mountInto: rootSpan,
  buildPopup: (close) => {
    const popup = document.createElement("div");
    // …fill the popup; call close() from an in-popup action to dismiss…
    return popup;
  },
});
```

## Public API

### `createPopupHost(options): PopupHost`

- **`doc: Document`** — Document whose capture-phase `pointerdown`/`keydown` events drive dismissal.
- **`trigger: HTMLElement`** — Element that toggles the popup; events on it count as "inside".
- **`mountInto: HTMLElement`** — Where the popup is appended when it opens.
- **`buildPopup: (close: () => void) => HTMLElement`** — Builds the popup element on each open;
  receives the host's `close` so an in-popup action can dismiss it.
- **`onOpened?: (popup: HTMLElement) => void`** — Called with the popup once it is mounted and
  repositioned. Move focus from here, not from `buildPopup`: an element that is still detached
  cannot take focus, so focusing during the build silently does nothing.
- **`interactive?: boolean`** — When `false`, the trigger click is not wired (read-only control).
  Defaults to `true`.

### `PopupHost`

- **`toggle(): void`** — Open when closed, close when open.
- **`close(): void`** — Close if open (idempotent).
- **`isOpen: boolean`** — Whether the popup is currently open.

## Staying on screen

Controls anchor their popup under the trigger (`position:absolute; top:100%; left:0`). On every open
the host measures the mounted popup and corrects that anchoring so the whole popup stays visible:

- It shifts the popup left by exactly what spills past the right edge of the **visible area** — never
  far enough to push it off the left edge, so a popup wider than that area is left as-is.
- It flips the popup **above** the trigger (`top:auto; bottom:100%`) when it spills past the bottom
  edge and actually fits above.
- A popup that cannot be measured (zero-sized, e.g. a detached or hidden host) is left untouched.

The visible area is the window's client box narrowed by every ancestor that clips or scrolls its
content. That is deliberately **not** `window.innerWidth`: enhanced views live in a scrolling overlay
whose scrollbars cover the last ~15px of the window, which is exactly where a popup anchored to a
right-most control would land.

## Escaping a scroll box that is too small

Some scroll boxes can never show a popup opened from inside them — the rolled-up children popup is
only as tall as its rows, so an ETA picker opening under a row was clipped away to nothing. When the
popup does not fit inside its clipping ancestors but **would** fit in the window, the host re-anchors
it to the viewport (`position:fixed` at the trigger's rect) so no ancestor's `overflow` can cut it
off, then applies the same shift/flip corrections against the window. A popup too big for the window
itself is left where the control put it.

A viewport-anchored popup no longer travels with its trigger, so while one is open the host also
closes it on any scroll raised outside it (capture phase, since `scroll` does not bubble). Scrolling
the popup's own contents does not dismiss it.

> This relies on no ancestor establishing a containing block for fixed positioning
> (`transform`, `filter`, `will-change`, `contain`). Verify that still holds before adding one.

Controls get this for free; they only supply the popup's contents.

## Why

The identical lazy-popup skeleton (create-on-open, remove-on-close, capture-phase outside/Escape
dismissal) previously lived inside every popup control. Centralising it keeps behaviour consistent
and satisfies the repo's DRY duplication gate.
