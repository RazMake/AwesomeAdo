# OrderingPicker Control

A compact **"how are these ordered?"** indicator for a view header: a single sorting glyph (`⇅`)
whose tooltip names the ordering policy in force, and which opens a menu of the policies from
[`common/ordering`](../../../ordering/README.md) when clicked.

The menu offers exactly the policies the options page's **Items ordering policy** dropdown offers,
because both are built from `ORDERING_POLICIES`.

## Usage

```typescript
import { renderOrderingPicker } from "path/to/OrderingPicker";

const picker = renderOrderingPicker(document, {
  policy: orderingPolicyOf(context.properties),
  onChange: (policy) => resortBoard(policy),
  // Optional: the glyph doubles as the drag-to-reorder status light.
  dragReorderUnavailable: (policy) =>
    policy === MANUAL_ORDERING_POLICY
      ? null
      : "drag to reorder is only available when ordering by importance",
});
header.append(picker);
```

## Public API

### `renderOrderingPicker(doc, options): HTMLElement`

Returns the picker element (a `<span class="awesomeado-ordering">` wrapping the trigger button and,
while open, its menu).

| Option                   | Meaning                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `policy`                 | The `OrderingPolicy` items are ordered by right now; sets the tooltip and the mark.  |
| `onChange`               | Called with the newly picked policy, immediately (pick-and-apply).                   |
| `dragReorderUnavailable` | Optional. Why drag-to-reorder is off under a policy, or `null` when it is available. |

### Behaviour

- The trigger is deliberately **discrete**: a bare, muted glyph with no border or fill that brightens
  on hover, so it can sit in a header corner as a quiet indicator instead of competing with the
  view's real controls.
- The trigger's `title`/`aria-label` read `Ordering: <policy label>` and are
  re-written after every pick, so the tooltip never describes a stale order.
- Clicking opens a menu of every policy; the active one is checked (`aria-checked="true"`) and bold.
  Picking one closes the menu and calls `onChange`.
- Picking the **already-active** policy closes the menu **without** calling `onChange`: callers
  rebuild their rows in response, and rebuilding to the identical order would only collapse the
  user's expanded items.
- Outside clicks, Escape, and staying on screen near a window edge are handled by the shared
  [`popupHost`](../popupHost/README.md).

### Drag-reorder status

When `dragReorderUnavailable` is supplied, the glyph doubles as the status light for a view's
drag-to-reorder affordance — it is already the one place that answers "what decides this order?", so
when a view can only honour a manual drag under one policy, the same indicator has to say so or the
rows silently stop responding with no explanation on screen.

- Available → the normal muted secondary color, `data-drag-reorder="available"`.
- Unavailable → a heavily-transparent red (`var(--status-error-text, #c50f1f)` at `0.25` opacity),
  `data-drag-reorder="unavailable"`, and the reason appended to the `title`/`aria-label`. The
  transparency is deliberate: reordering being off is worth noticing but is not an error to fix, so
  it must not read as an alarm in a header the user looks at all day. Hover still reaches full
  opacity so the tooltip is reachable.
- Re-evaluated after every pick, so the glyph flips state without the view re-rendering it.
- The **rule** and its wording stay with the view (this is a reason string, not a boolean); the
  control only presents it.

The control never re-orders anything and never persists the choice — the view that renders the
items decides what a new policy means for what is on screen.
