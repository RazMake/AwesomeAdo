# TagPill Control

A small, theme-agnostic pill that renders a person's Feature Crew **tag** as a bright colored badge.
Used both inline on the assignee chip (`AssignedTo`) and as a clickable filter toggle in a view's tag
filter panel, so both always look identical.

## Usage

```typescript
import { renderTagPill } from "path/to/TagPill";

// Static label (e.g. next to an assignee):
const label = renderTagPill(document, { tag: "Platform" });

// Interactive filter toggle:
const toggle = renderTagPill(document, {
  tag: "Platform",
  interactive: true,
  selected: true,
  onToggle: () => refreshFilter(),
});
```

## Public API

### `TagPillOptions`

- **`tag: string | null`** — The tag text. `null` or `""` renders the neutral **"??"** pill (an
  assigned person with no tag yet).
- **`interactive?: boolean`** — When `true`, renders a `<button>` filter toggle; otherwise a static
  `<span>` label.
- **`selected?: boolean`** — When interactive, whether this pill is part of the active filter
  (full-strength + white ring vs. dimmed).
- **`onToggle?: () => void`** — When interactive, called on click.

### `renderTagPill(doc, options): HTMLElement`

Renders the pill. A real tag gets a bright, deterministic per-tag color (same tag → same color); the
untagged pill gets a fixed grey.

### `tagPillBackground(tag): string`

The CSS background a tag pill wears — exposed so callers can color-match related affordances.

### `UNTAGGED_LABEL`

The literal (`"??"`) shown for a missing tag.

## Notes

- **Deterministic color:** the tag's hue is derived from a small string hash, so the palette is
  unbounded (teams invent their own tags) yet stable across loads.
- **Theme-agnostic:** bright HSL fills and white text read on light, dark, and Follow-ADO themes; the
  untagged pill uses a fixed grey rather than a theme token.
