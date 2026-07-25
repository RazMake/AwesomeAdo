---
name: add-enhanced-view
description: Step-by-step recipe for adding a new enhanced view to the AwesomeADO extension, including copy-paste "hello world" boilerplate. Use when asked to add, scaffold, or register a new query view.
---

# Add an Enhanced View Skill

Read [AGENTS.md](../../../AGENTS.md) first. This skill adds workflow detail without copying rule
bodies. Full API docs live in [`src/content/views/README.md`](../../../src/content/views/README.md)
(the concrete views) and
[`src/common/view-common/README.md`](../../../src/common/view-common/README.md) (the `ViewType` /
`EnhancedView` contracts).

## What an enhanced view is

An **enhanced view** is one way AwesomeADO can present an Azure DevOps query in place of ADO's own
page (e.g. Sprint View, Project Tracking). Each view owns a folder under `src/content/views/<view>/`
and has **two halves**, kept separate on purpose:

| Half              | Contract       | File                | Bundled into      |
| ----------------- | -------------- | ------------------- | ----------------- |
| **Configuration** | `ViewType`     | `<view>ViewType.ts` | options + content |
| **Renderer**      | `EnhancedView` | `<view>View.ts`     | content only      |

The options binding form and settings import/export only need the **config**, so they never import a
renderer (which keeps view DOM code out of the options bundle). Options may import exactly one content
module — `content/views/viewCatalog` — and a lint zone (`import-x/no-restricted-paths`) blocks
anything else; so a `<view>ViewType.ts` **must never import** its `<view>View.ts` renderer (see
ADR-027).

## When to use this skill

- Adding a new query view of any kind.
- Scaffolding a placeholder ("hello world") view to build on.

## Recipe

Replace `<view>` (folder / kebab id), `<viewCamel>` (identifier), and the label/copy throughout.

### 1. Create the config — `src/content/views/<view>/<viewCamel>ViewType.ts`

```typescript
import type { ViewType } from "../../../common/view-common/ViewType";

/** The <Label> view's configuration. */
export const <viewCamel>ViewType: ViewType = {
  id: "<viewCamel>", // stable id persisted on bindings — never rename once shipped
  label: "<Label>",
  properties: [], // add ViewTypeProperty entries when the view needs per-query inputs
};
```

### 2. Create the renderer — `src/content/views/<view>/<viewCamel>View.ts`

Start from the shared placeholder shell; the real UI grows in here later.

```typescript
import type { EnhancedView } from "../../../common/view-common/EnhancedView";
import { renderViewScaffold } from "../shared/ViewScaffold";

import { <viewCamel>ViewType } from "./<viewCamel>ViewType";

/** The <Label> view's renderer. Placeholder shell for now. */
export const <viewCamel>View: EnhancedView = {
  id: <viewCamel>ViewType.id,
  render: (context) =>
    renderViewScaffold(context.doc, {
      title: <viewCamel>ViewType.label,
      message: "Hello world from the <Label> view.",
    }),
};
```

### 3. Register both halves

- Config in [`src/content/views/viewCatalog.ts`](../../../src/content/views/viewCatalog.ts): import
  `<viewCamel>ViewType` and add it to `VIEW_TYPES`.
- Renderer in
  [`src/content/views/enhancedViewRegistry.ts`](../../../src/content/views/enhancedViewRegistry.ts):
  import `<viewCamel>View` and add it to `ENHANCED_VIEWS`.

Keep the two lists in the same order so the config and its renderer stay aligned.

### 4. Document the folder — `src/content/views/<view>/README.md`

Describe the view's config id/label/properties and its renderer, mirroring
[`sprint/README.md`](../../../src/content/views/sprint/README.md).

### 5. Add tests

- Extend `viewCatalog.test.ts` and `enhancedViewRegistry.test.ts` so the new id resolves and the
  catalog/registry stay in parity.
- If the view declares properties, cover their defaults/validation.

## Verify

Run the focused tests, then the full gate:

```
pnpm exec vitest run src/content/views src/common/view-common
pnpm verify
```

Coverage must stay ≥ 85%; a placeholder view built from `renderViewScaffold` needs only the registry
parity test to be covered.

## References

- View API + "adding a view" summary: `src/content/views/README.md`
- View contracts: `src/common/view-common/README.md`
- Shared shell: `src/content/views/shared/README.md`
- Reference views: `src/content/views/sprint`, `src/content/views/project-tracking`
