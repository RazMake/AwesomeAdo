# EtaBadge

Renders an inline badge displaying the target ETA date with semantic urgency color and countdown
tooltip. When handed an `onChange` callback the badge becomes **editable**: it invites a click with a
hand cursor and opens a small date-picker popup.

## API

```typescript
interface EtaBadgeOptions {
  /** The target ETA date (ISO 8601); null or empty means no ETA is set. */
  eta: string | null;
  /** The reference point (current time) for countdown calculation. */
  now: Date;
  /**
   * When provided, the badge is editable: clicking opens a date picker (plus a Clear button while an
   * ETA is set). Picking a date calls this with an ISO timestamp; Clear calls it with `null`. The
   * caller persists the choice and then reflects the committed value via the handle's `setEta`.
   */
  onChange?: (eta: string | null) => void;
}

interface EtaBadgeHandle extends HTMLElement {
  /** Update the displayed ETA (or `null` to show "No ETA") after a committed write. */
  setEta(eta: string | null): void;
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

When no ETA is set (`null` or empty string), the badge displays **"No ETA"** in a muted color, dimmed
further with opacity so it reads as fainter than any row that carries a real date. This
muted text is **theme-aware** via CSS variable `--text-secondary-color`, ensuring it adapts to light
or dark themes. Severity paint comes from the theme's `--eta-*` semantic roles, preserving consistent
urgency meaning while allowing each concrete palette to tune contrast.

### Editing (when `onChange` is provided)

- The badge shows a **hand cursor**; clicking opens a date-picker popup pre-filled with the current
  ETA's PST calendar date.
- **Picking a date** calls `onChange` with the chosen day as a noon-UTC ISO timestamp
  (`YYYY-MM-DDT12:00:00Z`) — noon keeps the picked calendar day intact when rendered back in PST —
  then dismisses the popup.
- A **Clear** button appears only while an ETA is set and calls `onChange(null)` to reset the item to
  the "No ETA" state. It carries a subtle border and brightens on hover so it reads as a button.
- The popup, the date input, and the Clear button draw their borders from a **self-contained** low-alpha
  grey rather than a neutral surface-wash token, so the chrome stays visible on every concrete theme.
  Surfaces and text still follow the theme.
- The browser's **own** calendar popup and its indicator glyph follow the view's `color-scheme`, which
  the enhanced-view host declares (see `common/view-common/themes`). The date field is therefore left
  transparent over the popup's themed surface so the browser's calendar button remains readable.
- Opening the popup injects one document-level rule (`#awesomeado-eta-picker-style`) giving that
  calendar button a **hand cursor**. It is the control's only non-inline style: the button is a UA
  pseudo-element that no inline style can reach. The rule is re-added on open if ADO's re-render drops
  it, and the id keeps it from stacking.
- The badge follows a **persist-then-reflect** flow: it does **not** update itself on a pick. The
  caller persists the change and calls `handle.setEta(...)` with the committed value, so a failed
  write never leaves a misleading date on screen (mirroring the status badge).
- The popup's lifecycle (outside-click / Escape dismissal) is owned by the shared popup host.

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
      }
    });
  },
});
container.appendChild(handle);
```
