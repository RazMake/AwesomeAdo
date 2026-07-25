# `common/view-common`

The **contracts** that define what an enhanced view is. These are pure abstractions — no DOM, no
`chrome.*`, zero runtime cost — so both the options page and the content surface can depend on them
(Dependency Inversion) without either bundle pulling in the other's code.

The concrete views (the catalog, the renderer registry, and each view's config + renderer) live
under [`src/content/views`](../../content/views/README.md).

## The two halves of a view

A view is deliberately split into two contracts so the options page never bundles renderer DOM:

| Half              | Contract       | What it is                                                                |
| ----------------- | -------------- | ------------------------------------------------------------------------- |
| **Configuration** | `ViewType`     | The properties a view needs, shown on the options binding form.           |
| **Renderer**      | `EnhancedView` | The DOM the view paints once a bound query resolves to it (content only). |

## Public API

### `ViewType.ts` — the configuration contract

- `ViewType` — a view's id, label, and the `ViewTypeProperty[]` a binding must satisfy.
- `ViewTypeProperty`, `ViewTypePropertyKind`, `ViewTypeOption` — the per-property shape (text /
  number / select, defaults, bounds, hint).
- `viewTypePropertyKind(property)` — the property's kind, defaulting to `"text"`.
- `resolveViewTypePropertyValue(property, stored)` — the effective value for a property given what a
  binding stored (applies the default when nothing was stored, clamps numbers, drops orphaned
  select values).

Both the options binding form and settings import/export depend only on this contract, never on a
renderer.

### `EnhancedView.ts` — the renderer contract

- `EnhancedView` — `{ id, render(context) }`; `id` matches the owning `ViewType.id`.
- `EnhancedViewContext` — `{ doc, queryId, properties }`, everything a view needs to render, injected
  so a renderer never reaches for a global.

Only the content surface implements and resolves `EnhancedView`s (see
[`src/content/views`](../../content/views/README.md)).
