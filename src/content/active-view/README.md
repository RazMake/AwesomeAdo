# src/content/active-view

This folder owns the **in-session view override** for the content script: whether a bound query is
currently showing its enhanced view or ADO's own standard page.

## Purpose

A [query binding](../../common/bindings/README.md) records _which_ enhanced view a query uses and is
browser-synced. Which of the two presentations a query shows on load, however, is governed by the
global `defaultView` setting — **not** by the binding. This folder adds the third piece: a
device-local, memory-only override so the user can flip one query between its enhanced view and ADO's
standard page from the top-bar menu **for the current session only**.

The override is deliberately never persisted. When the content script is re-injected — a fresh page
load, or reopening the browser — the override map is empty again and every bound query falls back to
the configured default view. That is the whole point: switching views is a "just for now" action, so
reopening the browser must not remember it.

## Public API

### `IActiveViewOverrides` — `IActiveViewOverrides.ts`

The read half of the contract, depended on by the page and menu controllers:

```typescript
interface IActiveViewOverrides {
  get(queryId: string): ActiveView | undefined; // undefined = follow the global default view
}
```

`resolveActiveView(override, defaultEnhanced)` from
[`common/bindings`](../../common/bindings/README.md) collapses an override (or its absence) plus the
global default into the concrete `"enhanced"` | `"standard"` a consumer should render.

### `SessionActiveViewOverrides` — `SessionActiveViewOverrides.ts`

The in-memory implementation. Construct it **once** at the content composition root
([`src/content/index.ts`](../index.ts)) and share it: the page controller reads it to decide what to
render, the top-bar menu reads it to check the active row, and the menu action writes to it via
`set(queryId, active)`.

```typescript
class SessionActiveViewOverrides implements IActiveViewOverrides {
  get(queryId: string): ActiveView | undefined;
  set(queryId: string, active: ActiveView): void;
}
```
