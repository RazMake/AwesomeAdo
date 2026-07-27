# `common/view-common`

The **contracts** that define what an enhanced view is. These are pure abstractions — no DOM, no
`chrome.*`, zero runtime cost — so both the options page and the content surface can depend on them
(Dependency Inversion) without either bundle pulling in the other's code.

The **one exception** is [`control/`](#control--the-shared-view-controls): the shared, theme-aware
view controls that render DOM. They are the sole DOM-bearing code allowed under `view-common`;
everything else here stays a pure contract.

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
- `EnhancedViewContext` — `{ doc, queryId, properties, services? }`, everything a view needs to render,
  injected so a renderer never reaches for a global. `services` is optional: present for data-driven
  views (carrying the tree loader, user directory, type catalog, sprint window, clock, logger), absent
  for placeholder views.
- `EnhancedViewServices` — the cross-view data/service singletons injected at the composition root:
  `loadTree`, `featureCrew`, `writeField`, `reorderItem`, `currentTeam`, `userDirectory`, `mentionDirectory`, `getTypes`,
  `getBoardColumns`, `loadSprintWindow`, `now`, `logger`, `openDiagnosticsLog`. `writeField` persists
  a single work item
  field change (e.g.
  `System.State` or a type's ETA date field) back to Azure DevOps, using the item's last-known rev as
  an optimistic-concurrency guard; a `null` value clears the field.
  `reorderItem` persists a drag-reorder: it moves an item to a new position among its siblings and,
  when it changed, under a new parent. It is kept separate from `writeField` because it is not a field
  patch — it moves the item's hierarchy **link** and re-ranks it through a team-scoped backlog
  endpoint, which owns the rank arithmetic (so the caller names the neighbours the item lands
  between, never a rank).
  `currentTeam` is the configured team's id, or `null` when none is set; backlog rank is per-team in
  Azure DevOps, so a view must refuse to reorder rather than guess a team — a move ranked against the
  wrong team's backlog silently reorders someone else's board.
  `loadSprintWindow` is the single shared entry point every sprint-filtering view uses to populate its
  sprint picker: it resolves the configured team's iterations around the current one, each labelled by
  its offset, plus the name to select by default.
  `getBoardColumns` returns the team's global board columns in order so a status's color can be keyed
  off its board-column position (identical for every work-item type).
  `openDiagnosticsLog` opens the extension's Diagnostics log filtered to errors, so a view can hand
  the user the recorded cause behind a failure it can only summarize on screen (the board's
  "Couldn't save…" chip); a view cannot open an extension page itself, so the round-trip is injected.

Only the content surface implements and resolves `EnhancedView`s (see
[`src/content/views`](../../content/views/README.md)).

## `control/` — the shared view controls

Reusable building blocks a view assembles its DOM from, one folder per control. This is the **sole**
DOM-bearing area of `view-common`: unlike the pure contracts above, these controls create elements
and are theme-aware via ADO CSS custom properties (with hard-coded fallbacks). They stay here so any
view — regardless of which bundle renders it — reuses the same consistent parts.

| Control            | Folder                                                             | What it renders                                                                                   |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `AssignedTo`       | [`control/AssignedTo`](./control/AssignedTo/README.md)             | The assignee's name as clickable text that opens a people picker popup.                           |
| `Breadcrumbs`      | [`control/Breadcrumbs`](./control/Breadcrumbs/README.md)           | A trail of clickable segments separated by a glyph (a "you are here").                            |
| `DateLabel`        | [`control/DateLabel`](./control/DateLabel/README.md)               | A `MM/DD/YYYY` PST date label with a full-timestamp hover tooltip.                                |
| `EtaBadge`         | [`control/EtaBadge`](./control/EtaBadge/README.md)                 | An ETA date badge with severity color, a countdown tooltip, and an optional editable date picker. |
| `ItemTypeIcon`     | [`control/ItemTypeIcon`](./control/ItemTypeIcon/README.md)         | The ADO work item type icon, sized to the title it precedes, at three emphasis levels.            |
| `MarkdownText`     | [`control/MarkdownText`](./control/MarkdownText/README.md)         | Author-written content (descriptions, notes) rendered as safe DOM, with images and @-mentions.    |
| `OrderingPicker`   | [`control/OrderingPicker`](./control/OrderingPicker/README.md)     | A discrete sort glyph naming the ordering policy in force, with a menu to change it.              |
| `TagPill`          | [`control/TagPill`](./control/TagPill/README.md)                   | A colored Feature Crew tag pill (a neutral "??" pill when untagged).                              |
| `WriteQueueStatus` | [`control/WriteQueueStatus`](./control/WriteQueueStatus/README.md) | A "Saving N change(s)…" spinner shown only while writes are in flight.                            |
| `ViewScaffold`     | [`control/ViewScaffold`](./control/ViewScaffold/README.md)         | The centered title + message placeholder shell every view starts from.                            |

See each control's own `README.md` for its API.
