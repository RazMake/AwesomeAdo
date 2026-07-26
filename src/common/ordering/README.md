# src/common/ordering

Shared item-ordering policies for the Project Tracking view.

## Purpose

Defines the ways a view can order the items within a group and turns a stored policy into a concrete
sort, so "most important first", "a–z", and "by ETA" mean the same thing everywhere items are shown.

## Public API

### `ItemOrdering.ts`

- **`OrderingPolicy`** — the union of policy ids stored on a binding (`importance`, `title`, `eta`).
- **`ORDERING_POLICIES`** — the pickable policies with their labels, in picker order (first is the
  default). The binding form's ordering dropdown is built from this list.
- **`DEFAULT_ORDERING_POLICY`** — the policy used until the user picks another.
- **`OrderableItem`** — the minimum an item exposes to be ordered: `importance` (manual rank, lower
  is more important), `title`, and `eta` (epoch ms or `null`).
- **`orderItems(items, policy)`** — returns a new, stably-sorted copy of `items` for the policy;
  ties keep their original order, and items without an ETA sort after dated ones under `eta`.

## Usage guidance

Read the policy from a binding's `orderingPolicy` property and pass it to `orderItems` with the
items to display; never re-implement a comparison inline so the rules stay in one place.

Items that do not already match `OrderableItem` are adapted at the call site rather than by widening
this contract — e.g. Project Tracking wraps each `TrackedWorkItem` in `{ item, importance, title, eta }`
with its ISO ETA converted to epoch milliseconds, sorts the wrappers, then unwraps. `orderItems` is
generic over the wrapper, so the caller still gets its own objects back.
