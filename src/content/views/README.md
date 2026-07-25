# `content/views`

The concrete **enhanced views** — the surfaces AwesomeADO paints in place of Azure DevOps' own query
page. Each view owns a folder under `views/<view>/` that holds **both halves** of the view together
(its config and its renderer), so a view reads top-to-bottom in one place. The abstract contracts the
views implement live in [`src/common/view-common`](../../common/view-common/README.md); shared
building blocks every view can reuse live in [`shared/`](./shared/README.md).

## Layout

```
content/views/
  viewCatalog.ts            the ordered list of view CONFIGS (ViewType)
  enhancedViewRegistry.ts   the ordered list of view RENDERERS (EnhancedView)
  shared/                   building blocks every view reuses (ViewScaffold, …)
  sprint/                   sprintViewType.ts (config) + SprintView.ts (renderer)
  project-tracking/         projectTrackingViewType.ts + ProjectTrackingView.ts
```

`VIEW_TYPES` and `ENHANCED_VIEWS` are kept in the **same order**, and every entry in one has a
matching entry (by id) in the other.

## The one cross-layer import (an intentional, scoped exception)

Views live under `content/` because they are content. But the options page needs each view's
**config** to build the binding form. To keep each view in a single folder, the options page is
allowed to import exactly one module from here — the config catalog:

- **Allowed:** `src/options/**` → [`content/views/viewCatalog`](./viewCatalog.ts) (config only).
- **Forbidden (lint-enforced):** any other `src/options/**` → `src/content/**` import, including
  `enhancedViewRegistry`, a `*View` renderer, or `shared/`.

This single doorway is enforced by `import-x/no-restricted-paths` in `eslint.config.js` and recorded
as an ADR in `.agents/memory-bank/decisions.md`. Because `viewCatalog` imports only each view's
`*ViewType` config (never its renderer), no view DOM code is ever pulled into the options bundle.

> **Guardrail for every view folder:** a `*ViewType.ts` config file must never import its
> `*View.ts` renderer. The dependency only flows renderer → config, which is what keeps the options
> bundle free of DOM code.

## Public API

### `viewCatalog.ts` — the ordered list of configs

- `VIEW_TYPES` — every `ViewType`, in picker order. The **only** module options may import from here.
- `getViewType(id)` — look up a config by stored id, or `undefined` for an unknown id.

### `enhancedViewRegistry.ts` — the ordered list of renderers (content only)

- `ENHANCED_VIEWS` — every `EnhancedView`, mirroring `VIEW_TYPES`.
- `getEnhancedView(id)` — resolve a binding's view id to its renderer, or `undefined`.

## Adding a view

A new view is a folder plus two one-line registrations. See the **`add-enhanced-view`** skill
(`.agents/skills/add-enhanced-view/SKILL.md`) for the copy-paste boilerplate that produces a
"hello world" view. In short:

1. Add `views/<view>/<view>ViewType.ts` exporting a `ViewType` (its config).
2. Add `views/<view>/<view>View.ts` exporting an `EnhancedView` that renders
   [`renderViewScaffold`](../../common/view-common/control/ViewScaffold/README.md) with the view's title and one line of body copy.
3. Register the config in `viewCatalog.ts` (`VIEW_TYPES`) and the renderer in
   `enhancedViewRegistry.ts` (`ENHANCED_VIEWS`) — same order in both.
4. Add a `README.md` to the new folder.
