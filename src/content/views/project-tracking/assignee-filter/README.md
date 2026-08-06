# Assignee Filter

The Project Tracking view's **Assigned To** vocabulary and predicate: who the header's filter offers,
and which rows a selection keeps.

## Behavior

- Offers only people assigned to **Primary work or anything configured beneath it**. Owners who sit
  on the planning levels above delivery (a Tech Lead, a milestone owner) are left out — they are
  accountable for a branch rather than working in it, so offering them would answer "show me this
  person's work" with a whole project. A catalog with no Primary work flagged has no such
  distinction, so every assigned person is offered.
- Each person is identified by their **alias**, not their display name: two people can share a name,
  and filtering on it would silently merge their work. The label carries the name plus the person's
  Feature Crew tag when they wear one.
- A selection keeps an item when the item **or anything beneath it** is assigned to one of the
  selected people, so a person who only ever appears on the tasks under someone else's story is not
  a name that empties the board.
- An empty selection narrows nothing, matching every other filter group on the board.

## Public API

### `assigneesInPrimaryWork(roots, types): AssigneeOption[]`

The distinct people to offer, ordered case-insensitively by label. Each `AssigneeOption` is
`{ key, label }` — `key` is the value exchanged with the filter control.

### `matchesAssigneeFilter(item, selected): boolean`

Whether one item survives the selection (`selected` holds `AssigneeOption.key` values).

### `assigneeKeyOf(item): string | null`

The key one item filters under, or `null` when nobody is assigned to it.
