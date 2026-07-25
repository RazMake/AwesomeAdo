# DateLabel

A formatted date label displaying MM/DD/YYYY in PST with a full-timestamp hover tooltip.

## Usage

```typescript
import { renderDateLabel } from "common/view-common/control/DateLabel/DateLabel";

const label = renderDateLabel(document, "2026-07-24T15:30:00Z");
parentElement.appendChild(label);
```

## Behavior

- **Valid ISO date**: Displays `MM/DD/YYYY` text with a tooltip showing the full `MM/DD/YYYY @ h:mm AM/PM PST` timestamp on hover.
- **Empty or invalid ISO**: Displays `—` with no tooltip.

The control applies `cursor:default` for consistent interaction, and inherits `font` and `color` from the parent so it adapts to Azure DevOps's theme (light or dark).

## Security

Uses `textContent` assignment (not `innerHTML`) to prevent HTML injection from crafted ISO strings.
