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
});
header.append(picker);
```

## Public API

### `renderOrderingPicker(doc, options): HTMLElement`

Returns the picker element (a `<span class="awesomeado-ordering">` wrapping the trigger button and,
while open, its menu).

| Option     | Meaning                                                                             |
| ---------- | ----------------------------------------------------------------------------------- |
| `policy`   | The `OrderingPolicy` items are ordered by right now; sets the tooltip and the mark. |
| `onChange` | Called with the newly picked policy, immediately (pick-and-apply).                  |

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

The control never re-orders anything and never persists the choice — the view that renders the
items decides what a new policy means for what is on screen.
