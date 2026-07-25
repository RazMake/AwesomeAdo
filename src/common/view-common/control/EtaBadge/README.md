# EtaBadge

Renders an inline badge displaying the target ETA date with semantic urgency color and countdown
tooltip.

## API

```typescript
interface EtaBadgeOptions {
  /** The target ETA date (ISO 8601); null or empty means no ETA is set. */
  eta: string | null;
  /** The reference point (current time) for countdown calculation. */
  now: Date;
}

function renderEtaBadge(doc: Document, options: EtaBadgeOptions): HTMLElement;
```

## Behavior

When an ETA is set, the badge shows **"ETA MM/DD/YYYY"** with a severity color reflecting urgency:

- **Overdue** (past the ETA date): red
- **Soon** (≤7 days remaining): orange
- **Upcoming** (8–30 days remaining): yellow
- **Distant** (>30 days remaining): muted

Hover displays a countdown tooltip (e.g., "in 2 weeks 3 days" or "overdue by 3 days").

When no ETA is set (`null` or empty string), the badge displays **"No ETA"** in a muted color. This
muted text is **theme-aware** via CSS variable `--text-secondary-color`, ensuring it adapts to light
or dark themes. The severity colors remain **semantic** (fixed color values) to maintain consistent
urgency signaling across all themes.

## Usage

```typescript
import { renderEtaBadge } from "common/view-common/control/EtaBadge/EtaBadge";

const badge = renderEtaBadge(document, {
  eta: "2026-08-15T00:00:00-07:00",
  now: new Date(),
});
container.appendChild(badge);
```
