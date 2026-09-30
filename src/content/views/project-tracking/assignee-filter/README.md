# Assignee Filter

The Project Tracking view's **Assigned To** vocabulary and predicate: who the header's filter offers,
and which rows a selection keeps.

## Behavior

- Offers **everyone assigned to any item** in the tree, planning levels (Features, milestones)
  included.
- Each person is identified by their **alias**, not their display name: two people can share a name,
  and filtering on it would silently merge their work. The label carries the name plus the person's
  Feature Crew tag when they wear one.
- A selection keeps an item when the item **or anything beneath it** is assigned to one of the
  selected people, so a person who only ever appears on the tasks under someone else's story is not
  a name that empties the board.
- A selected person's own planning items stay visible even when none of their children match, so
  selecting a Feature owner shows that Feature on its own.
- After an assignment is saved, the offered people and visible rows are rebuilt from the live tree
  immediately; they do not wait for Feature Crew reconciliation to change anything.
- An empty selection narrows nothing, matching every other filter group on the board.

## Public API

### `assigneesInTree(roots): AssigneeOption[]`

The distinct people to offer, ordered case-insensitively by label. Each `AssigneeOption` is
`{ key, label }` — `key` is the value exchanged with the filter control.

### `matchesAssigneeFilter(item, selected): boolean`

Whether one item survives the selection (`selected` holds `AssigneeOption.key` values).

### `planningIdsOwnedBySelection(root, types, selected, accepts): Set<number>`

Ids of planning items assigned to a selected person (and accepted by the caller's other filters),
plus their ancestors, to add to the visible set.

### `assigneeKeyOf(item): string | null`

The key one item filters under, or `null` when nobody is assigned to it.
