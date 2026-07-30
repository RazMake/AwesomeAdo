# PriorityBadge

A theme-aware, editable Azure DevOps priority chip. Every priority uses the same gray background and
edge: the existing subtle wash on light themes, and a darker solid fill and border on dark themes.
P0 uses literal red text, P1 literal orange text, and P2 a restrained scheme-aware gray; all three
remain emphasized, with P2 at medium weight below the extra-bold P0 and P1. P3 and later use the
theme's muted secondary text at normal weight. The red/orange
shade is selected directly for the declared color scheme without mixing it with another color.
Compact padding keeps the background close to the label.

## Usage

```typescript
const badge = renderPriorityBadge(document, {
  priority: 1,
  onChange: (priority) => savePriority(priority),
});
```

Clicking the chip opens P0 through P4 as chips with the same background, edge, and text-color rules
used in the view. The current value is omitted. Call `setPriority(priority)` after the write commits
to update the visible value and text color.
