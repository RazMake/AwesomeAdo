# DragReorder

Shared row drag-and-drop mechanics for enhanced views: grabbing a registered handle and dropping it
elsewhere resolves a placement, which the owning view persists and applies to its own model. Project
Tracking's tree rows and Sprint's direct-child popups both use it.

The controller decides and previews; it **never writes**. Persist the `PlannedMove` yourself and
repaint only **after** Azure DevOps accepts it — views here are persist-then-reflect throughout, so a
rejected move must leave the item visibly where it started.

## Public API

### `DragReorderController.ts`

- **`new DragReorderController(doc, onMove, logger)`** — turns rows into a drag surface.
  - **`register(row: DraggableRow)`** — makes one row draggable by its `handle` and a drop target for
    rows at its own or an adjacent level. A row that is never registered is never draggable, so the
    caller alone decides when reordering is offered.
  - **`reset()`** — abandons any drag still in flight. Call it before a repaint; the previous pass's
    registrations need no undoing because their elements are discarded with it.
- **`DraggableRow`** — what one row tells the controller: its `id`, `depth`, `hasChildren`,
  `parentId`, the parent's default `destinationType`, the level's **full unfiltered** `siblingIds` in
  display order, and three elements — the `handle` (the title), the `row` line box (whose midpoint
  decides above/below), and the `wrapper` the insertion line slots against. A row whose chrome extends
  past `row` — trailing padding, a description or notes panel — also passes a `dropZone` covering all
  of it; only the drop TARGET widens, so `row` still decides which side the drop lands on. Popup rows
  also provide their `dragSurface` and `onLeaveSurface`: drag events remain local while the pointer is
  inside that surface, then reaching a legal target outside it dismisses the popup without ending the
  drag.
- **`PlannedMove`** — a resolved drop: `{ id, currentParentId, parentId, previousId, nextId,
siblingIds, type? }`, handed to `onMove` for the caller to persist.

### `movePlacement.ts`

- **`MovePlacement`** — a landing spot as ADO takes it: `parentId` plus the `previousId`/`nextId` it
  sits between (`0` is ADO's sentinel for "no parent" / "start" / "end").
- **`ResolvedMove`** — a `MovePlacement` plus `siblingIds`, the destination level in its **post-drop**
  order. Azure DevOps refuses to rank items that hold no backlog position, and the rank written by
  hand in that case is derived from the level the user actually ended up with.
- **`placementOf(id, siblingIds, parentId)`** — the placement an item already occupies, or null when
  it is not in the list.
- **`resolveMove({...})`** — where a drop lands, or **null** when the drop is impossible or is a
  no-op (dropped back onto its own slot). Pure, so the rules are testable without a DOM.

### `DropIndicator.ts`

- **`new DropIndicator(doc)`** with **`show(wrapper, side, { reparenting, parentContainer })`** and
  **`clear()`** — the insertion line, plus the wash that names the destination when the drop also
  changes parent. Same-parent ordering uses the theme accent; reparenting uses the theme success
  color, so the marker communicates which operation will happen without fixed light-only colors. The
  line paints over the boundary and occupies **no** layout space: a marker that pushed the rows below
  it down would move the target away from the pointer mid-drag and leave the drop with nowhere to
  land.

## Usage guidance

Register every rendered row on each pass, calling `reset()` first. Pass the level's **full** sibling
list, not the filtered one — ranking against only the visible rows would place the item relative to
whatever the view's filters happened to leave on screen, so clearing a filter afterwards would reveal
it somewhere the user never dropped it.

**Leave no band between two rows unclaimed.** A drop that reaches no registered row is discarded in
silence — no error, no log line, nothing moved — which reads as a broken gesture rather than a
refused one. Two things guarantee it cannot happen: the insertion line takes **no layout space**
(negative margins cancel its height), so showing it never slides the target row out from under the
pointer; and a row's `dropZone` covers every pixel the row owns, so the space between two rows
belongs to one of them.

Hierarchy changes move one level at a time. Dropping a child between rows one level above promotes it
under their parent; dropping a leaf among rows one level below demotes it under their parent at the
exact targeted position. A source that still owns children cannot be demoted. Any changed parent also
requires the destination parent's configured default child type; without one, the drop is refused.
A drop that reproduces the item's current placement is reported as no move at all.
