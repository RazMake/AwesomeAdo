# ItemLifecycleInfo

A single-line lifecycle label reading `{Created|Last Modified} on: {date}`, theme-aware for Azure
DevOps query views.

## Usage

```typescript
import {
  renderItemLifecycleInfo,
  type ItemLifecycleInfoOptions,
} from "common/view-common/control/ItemLifecycleInfo/ItemLifecycleInfo";

const label = renderItemLifecycleInfo(document, {
  event: "created",
  timestamp: "2026-07-24T15:30:00Z",
  user: { displayName: "Alice Doe", uniqueName: "alice@example.com", imageUrl: null },
});
parentElement.appendChild(label);
```

## Public API

### `ItemLifecycleInfoOptions`

- **`event: "created" | "last-modified"`** — Which lifecycle moment to describe; renders as
  `Created` or `Last Modified`.
- **`timestamp: string`** — ISO 8601 timestamp of when the create/modify happened.
- **`user: TrackedUser | null`** — The person who created or last changed the item; `null` omits the
  actor tooltip.

### `renderItemLifecycleInfo(doc: Document, options): HTMLElement`

Renders `{Created|Last Modified} on: {date}`.

## Behavior

- The event word (`Created` / `Last Modified`) shows a `By {full name}` tooltip on hover; no tooltip
  when `user` is `null`.
- The date is rendered by the [DateLabel](../DateLabel/README.md) control, which formats `MM/DD/YYYY`
  in PST and carries its own `@ h:mm AM/PM PST` time tooltip.
- An empty or invalid `timestamp` renders as `—` (delegated to `DateLabel`).
- Inherits `font` and `color` from the parent. Only the `Created on:` / `Last Modified on:` label is
  dimmed with `opacity` so it reads as muted, supporting detail on every Azure DevOps theme (light,
  dark, and Follow ADO); the date itself stays full-strength.

## Security

The `user.displayName` is only ever written to the `title` attribute (never `innerHTML`), so a
crafted display name cannot inject HTML.
