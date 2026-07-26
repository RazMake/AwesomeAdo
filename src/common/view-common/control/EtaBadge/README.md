# EtaBadge

Renders an inline badge displaying the target ETA date with semantic urgency color and countdown
tooltip. When handed an `onChange` callback the badge becomes **editable**: it invites a click with a
hand cursor and opens a small editor with a date field, a calendar button, and a Clear button.

## API

```typescript
interface EtaBadgeOptions {
  /** The target ETA date (ISO 8601); null or empty means no ETA is set. */
  eta: string | null;
  /** The reference point (current time) for countdown calculation. */
  now: Date;
  /**
   * When provided, the badge is editable: clicking opens the editor (date field, calendar, Clear).
   * Picking a date calls this with an ISO timestamp; Clear calls it with `null`. The caller persists
   * the choice and then reflects the committed value via the handle's `setEta`.
   */
  onChange?: (eta: string | null) => void;
}

interface EtaBadgeHandle extends HTMLElement {
  /** Update the displayed ETA (or `null` to show "No ETA") after a committed write. */
  setEta(eta: string | null): void;
  /** Flag (message) or clear (`null`) a failed write so it is never invisible. */
  setWriteError(message: string | null): void;
}

function renderEtaBadge(doc: Document, options: EtaBadgeOptions): EtaBadgeHandle;
```

## Behavior

When an ETA is set, the badge shows **"ETA MM/DD/YYYY"** with a severity color reflecting urgency:

- **Overdue** (past the ETA date): red, **bold** so a slipped date is unmissable
- **Soon** (≤7 days remaining): orange
- **Upcoming** (8–30 days remaining): yellow
- **Distant** (>30 days remaining): muted

Hover displays a countdown tooltip (e.g., "in 2 weeks 3 days" or "overdue by 3 days").

When no ETA is set (`null` or empty string), the badge displays **"No ETA"** in a muted color. This
muted text is **theme-aware** via CSS variable `--text-secondary-color`, ensuring it adapts to light
or dark themes. The severity colors remain **semantic** (fixed color values) to maintain consistent
urgency signaling across all themes.

### Editing (when `onChange` is provided)

- The badge shows a **hand cursor**; clicking opens an editor popup with three controls: a date
  field pre-filled with the current ETA's PST calendar date, a **calendar** button, and **Clear**.
- The **calendar** button toggles the extension's own themed calendar
  ([DatePicker](../DatePicker/README.md)). The browser's native picker is deliberately hidden: it
  renders in the browser's color scheme rather than the view's theme, and cannot be kept inside the
  window.
- **Picking a date** (from the calendar or by typing into the field) calls `onChange` with the chosen
  day as a noon-UTC ISO timestamp (`YYYY-MM-DDT12:00:00Z`) — noon keeps the picked calendar day
  intact when rendered back in PST — then dismisses the popup.
- **Clear** is always offered; while an ETA is set it calls `onChange(null)` to reset the item to the
  "No ETA" state, and with nothing set it simply dismisses.
- The badge follows a **persist-then-reflect** flow: it does **not** update itself on a pick. The
  caller persists the change and calls `handle.setEta(...)` with the committed value, so a failed
  write never leaves a misleading date on screen (mirroring the status badge). When the write fails,
  call `handle.setWriteError(message)`: the badge appends a red ⚠ and shows the message as its
  tooltip, so a rejected write is never indistinguishable from "nothing happened". The next
  `setEta` clears it.
- The popup's lifecycle (outside-click / Escape dismissal, and staying inside the window) is owned by
  the shared popup host.

## Usage

```typescript
import { renderEtaBadge } from "common/view-common/control/EtaBadge/EtaBadge";

// Read-only badge.
const badge = renderEtaBadge(document, {
  eta: "2026-08-15T00:00:00-07:00",
  now: new Date(),
});
container.appendChild(badge);

// Editable badge, persisting through a queue and reflecting the committed value.
const handle = renderEtaBadge(document, {
  eta: item.eta,
  now: new Date(),
  onChange: (newEta) => {
    queue.enqueue({ id: item.id, rev: item.rev, field: etaField, value: newEta }).then((result) => {
      if (result.ok && result.rev !== undefined) {
        item.eta = newEta;
        item.rev = result.rev;
        handle.setEta(newEta);
      } else {
        handle.setWriteError("Could not save this ETA. See the AwesomeADO diagnostics log.");
      }
    });
  },
});
container.appendChild(handle);
```
