# `RowEmphasis`

The shared **row background treatment** every tree board paints its items with: alternating stripes
in visible reading order, a subtle pointer hover, and a stronger emphasis while the reader holds
**Ctrl+Shift+Alt**.

The control knows nothing about what a row _contains_ — it is handed the caller's own class names —
so Project Tracking and the All Projects Catalog share one look, one modifier gesture, and one
document-level listener rather than three look-alike copies.

## Public API

- `RowEmphasisClasses` — `{ wrapper, surface, children }`. `wrapper` marks one item (its surface plus
  any nested children container), `surface` is the element the stripe and hover actually paint, and
  `children` is the nested container a collapsed branch hides with `display:none`.
- `createRowEmphasisStyle(doc, classes, extraSurfaceCss?): HTMLStyleElement` — the board-scoped
  stylesheet. Append it once inside the view. `extraSurfaceCss` adds declarations to the surface rule
  for a view that needs its own spacing.
- `restripeVisibleRows(container, classes): void` — reassigns the stripes after a branch expanded or
  collapsed, or after the tree was rebuilt.
- `modifierHighlightTracker(doc): ModifierHighlightTracker` — `register(root)` / `unregister(root)`.
- `MODIFIER_HIGHLIGHT_CLASS` — the marker the tracker toggles on a registered root.

## Usage

```typescript
const CLASSES = {
  wrapper: "awesomeado-projects__item",
  surface: "awesomeado-projects__row",
  children: "awesomeado-projects__children",
};

// Once, when the view root is created:
modifierHighlightTracker(context.doc).register(root);
root.append(createRowEmphasisStyle(context.doc, CLASSES));

// After every paint, and after any expand/collapse:
restripeVisibleRows(list, CLASSES);

// In the view's `dispose`:
modifierHighlightTracker(root.ownerDocument).unregister(root);
```

## Behaviour

- Stripes are assigned by visible depth-first order onto `data-row-stripe`, because CSS `:nth-child`
  restarts at every nesting level and counts branches nobody has opened (ADR-052).
- Colours come from the theme roles `--item-row-background`, `--item-row-alternate-background`,
  `--item-row-hover-background`, and `--item-row-emphasis-background`, so contrast stays tuned per
  theme.
- The modifier listener is installed once per document and shared by every registered root, and its
  state is latched — a view painted while the keys are already held is emphasized immediately.
- Losing window focus clears the emphasis, because leaving the tab never reports the key-up.
- A root that is no longer connected is dropped from the tracker on the next modifier change, so a
  view that never called `unregister` cannot leak.
