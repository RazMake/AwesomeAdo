# WriteQueueStatus

A theme-aware, presentational indicator that graphically shows when work-item state changes are
still being saved to Azure DevOps — an animated spinner plus a `Saving N change(s)…` label. It is
driven purely by a numeric count and is decoupled from the write queue and any ADO types; the caller
feeds it counts.

## Usage

```typescript
import {
  renderWriteQueueStatus,
  type WriteQueueStatusOptions,
} from "common/view-common/control/WriteQueueStatus/WriteQueueStatus";

const status = renderWriteQueueStatus(document, { count: 0 });
toolbar.appendChild(status.element);

// Later, as the queue depth changes:
status.setCount(3); // shows "Saving 3 changes…"
status.setCount(0); // hides the indicator again
```

## Public API

### `WriteQueueStatusOptions`

Configuration for the initial render.

- **`count?: number`** — Initial number of pending writes. Default `0` (idle → the indicator is
  hidden).

### `WriteQueueStatusHandle`

The mounted indicator plus its update handle.

- **`element: HTMLElement`** — The root `span` to mount.
- **`setCount(count: number): void`** — Update the pending-write count; `0` hides the indicator, `> 0`
  shows the animated "saving" state. Idempotent and safe to call repeatedly with the same value.

### `renderWriteQueueStatus(doc: Document, options?: WriteQueueStatusOptions): WriteQueueStatusHandle`

Renders the indicator.

- **Idle** (`count <= 0`): the root is hidden (`display:none`) and its text is cleared — the
  "nothing in the queue" state.
- **Busy** (`count > 0`): the root is visible (`display:inline-flex`) and shows the spinner followed
  by grammatically-correct text — `Saving 1 change…` for one, `Saving N changes…` for many.

## Features

- **Hidden when idle:** No visual noise when there is nothing to save; the indicator only appears
  while writes are in flight.
- **Accessible:** The root carries `role="status"` and `aria-live="polite"` so assistive tech
  announces when saves start and finish.
- **Stylesheet-free SMIL spinner:** The spinner is a self-contained inline SVG animated via
  `<animateTransform>` (SMIL), so it spins deterministically without any `@keyframes` or injected
  CSS. The stroke uses `currentColor` to inherit the themed accent text color.
- **Theme-aware:** Text color uses ADO CSS custom properties with fallbacks
  (`var(--communication-foreground, var(--text-primary-color, #323130))`), adapting to light/dark
  themes.
- **Robust counts:** Negative and non-finite counts are treated as idle, so a bad count can never
  render a bogus indicator.
- **HTML injection safety:** The label is set via `textContent`, never `innerHTML`.
