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
- **`interactive?: boolean`** — When `false`, the trigger click is not wired (read-only control).
  Defaults to `true`.

### `PopupHost`

- **`toggle(): void`** — Open when closed, close when open.
- **`close(): void`** — Close if open (idempotent).
- **`isOpen: boolean`** — Whether the popup is currently open.

## Why

The identical lazy-popup skeleton (create-on-open, remove-on-close, capture-phase outside/Escape
dismissal) previously lived inside every popup control. Centralising it keeps behaviour consistent
and satisfies the repo's DRY duplication gate.
