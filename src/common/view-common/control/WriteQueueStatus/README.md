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

const status = renderWriteQueueStatus(document, {
  count: 0,
  // Where activating the failure chip should take the user for the cause it cannot show.
  onOpenLog: () => services.openDiagnosticsLog(),
});
toolbar.appendChild(status.element);

// Later, as the queue depth changes:
status.setCount(3); // shows "Saving 3 changes…"
status.setCount(0); // hides the indicator again

// When a write is rejected, pass why so the chip can explain itself on hover.
status.setFailedCount(1, "order HTTP 400: TF401232: work item 123 does not exist");
```

## Public API

### `WriteQueueStatusOptions`

Configuration for the initial render.

- **`count?: number`** — Initial number of pending writes. Default `0` (idle → the indicator is
  hidden).
- **`onOpenLog?: () => void`** — Invoked when the user activates the failure chip (click, or
  Enter/Space while it is focused), so the owning surface can take them to the details of what was
  lost. Injected because the control is presentational and must not know that extension pages exist;
  omit it and the chip only dismisses.

### `WriteQueueStatusHandle`

The mounted indicator plus its update handle.

- **`element: HTMLElement`** — The root `span` to mount.
- **`setCount(count: number): void`** — Update the pending-write count; `0` hides the indicator, `> 0`
  shows the animated "saving" state. Idempotent and safe to call repeatedly with the same value.
- **`setFailedCount(count: number, reason?: string): void`** — Update the count of writes that were
  rejected, and optionally why the latest one was. A positive count wins over "saving": a user who
  has lost an edit needs to know that before they need to know a later edit is still in flight.

### `renderWriteQueueStatus(doc: Document, options?: WriteQueueStatusOptions): WriteQueueStatusHandle`

Renders the indicator.

- **Idle** (`count <= 0`): the root is hidden (`display:none`) and its text is cleared — the
  "nothing in the queue" state.
- **Busy** (`count > 0`): the root is visible (`display:inline-flex`) and shows the spinner followed
  by grammatically-correct text — `Saving 1 change…` for one, `Saving N changes…` for many.
- **Failed** (`failedCount > 0`, wins over both): a filled alert chip — warning triangle plus
  `Couldn't save N change(s)` — with the spinner hidden, since it would imply the write is still on
  its way.

## Features

- **The failed state is an ALERT, not a label:** a solid error fill with white text at a larger size
  and weight, a hairline border and a drop shadow. A tinted line of 11px text was not enough: every
  control on a persist-then-reflect board leaves the screen unchanged when a write is rejected, so
  this indicator is the ONLY on-screen evidence that an edit was lost — and at label weight in a
  header corner it read as decoration and was glanced past.
- **Attention pulse:** the warning triangle pulses a fixed number of times when the failure count
  **grows**, so a second lost edit is as noticeable as the first (an already-visible chip would
  otherwise change only its number). It is deliberately finite — the point is to catch the eye at the
  moment the edit is lost, not to leave a badge blinking all session. Replay uses the SMIL
  `beginElement` API, guarded so non-browser DOMs (jsdom) are unaffected.
- **The reason is on the chip:** `setFailedCount`'s `reason` becomes the chip's `title`, so hovering
  explains the failure and points at the Diagnostics log. The chip has room for a count, not a cause.
- **Activating it opens the details:** clicking the chip (or pressing Enter/Space while it is focused
  — it takes a tab stop only while failed) calls `onOpenLog` and then hides the chip. Reading the
  failure where it was recorded IS the acknowledgement, so the corner goes quiet; dismissing does
  **not** clear the owner's failure count. A dismissal is deliberately scoped to the failures the
  user actually SAW: a growing count un-dismisses the chip so a later lost edit is never hidden by an
  earlier acknowledgement, and clearing the count to `0` resets it entirely. With no `onOpenLog`
  wired, activation only dismisses — and the tooltip says so rather than promising details.

- **Hidden when idle:** No visual noise when there is nothing to save; the indicator only appears
  while writes are in flight.
- **Accessible:** The root carries `role="status"` and `aria-live="polite"` while idle or saving, and
  switches to `role="alert"` / `aria-live="assertive"` while a failure is showing — "polite" waits
  for a pause in what the user is doing, which on a board they are actively editing can mean the
  announcement never lands.
- **Stylesheet-free SMIL spinner:** The spinner is a self-contained inline SVG animated via
  `<animateTransform>` (SMIL), so it spins deterministically without any `@keyframes` or injected
  CSS. The stroke uses `currentColor` to inherit the themed accent text color.
- **Theme-aware:** Every color is an ADO CSS custom property with a literal fallback — the saving
  text uses `var(--communication-foreground, var(--text-primary-color, #323130))` and the failed chip
  `var(--palette-error-background, #c50f1f)` with `var(--text-on-communication-background, #ffffff)`
  — so both states read on light, dark, blue and "Follow ADO" alike.
- **Robust counts:** Negative and non-finite counts are normalized to idle **where they enter** the
  control, not at render time, so a bad value cannot latch and silently suppress a later pulse.
- **HTML injection safety:** The label is set via `textContent`, never `innerHTML`.
