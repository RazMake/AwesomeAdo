---
name: add-ordering-policy
description: Recipe for adding or changing an item ordering (sorting) policy in AwesomeADO, and for teaching a view to apply one. Use when asked to add a sort order, change how items are ordered, or wire a view up to the ordering policies.
---

# Add an Ordering Policy Skill

Read [AGENTS.md](../../../AGENTS.md) first. This skill adds workflow detail without copying rule
bodies. The public API lives in
[`src/common/ordering/README.md`](../../../src/common/ordering/README.md).

## What an ordering policy is

An **ordering policy** is one named way to sort the items inside a group ("most important first",
"a–z", "by ETA"). Policies are **common code**: `src/common/ordering/ItemOrdering.ts` is the single
place that says what each one means, so every view sorts identically and the options binding form
offers exactly the policies that exist.

The wiring has three layers, and a new policy usually touches all three:

| Layer    | File                                         | Owns                                          |
| -------- | -------------------------------------------- | --------------------------------------------- |
| Policy   | `src/common/ordering/ItemOrdering.ts`        | the ids, labels, comparators, `OrderableItem` |
| Config   | `src/content/views/<view>/<view>ViewType.ts` | the `orderingPolicy` property + its reader    |
| Renderer | `src/content/views/<view>/<view>View.ts`     | adapting items and calling `orderItems`       |

## When to use this skill

- Adding a new sort order to the picker.
- Changing what an existing policy compares.
- Teaching a view (a new one, or one that still renders in query order) to apply the policies.

## Recipe — add a policy

### 1. Declare it in `src/common/ordering/ItemOrdering.ts`

1. Add the id to the `OrderingPolicy` union.
2. Add `{ value, label }` to `ORDERING_POLICIES` **in picker order**. The first entry is the default
   the picker shows, so keep `DEFAULT_ORDERING_POLICY` pointing at it.
3. Add the `case` to `comparatorFor`.

### 2. Add the sort key to `OrderableItem` only if the policy needs new data

`OrderableItem` is the minimum an item must expose. Keep it small and **primitive**: `importance` is
a number, `title` a string, `eta` epoch milliseconds — never a `Date`, never an ISO string, never a
whole domain object. Callers adapt to it (step 4); widening it drags every caller along.

### 3. Comparator rules (these are where the bugs live)

- **Never return `NaN`.** A subtracting comparator (`a.x - b.x`) turns two `Infinity` sentinels into
  `NaN`, and a `NaN` comparator result silently scrambles the array instead of leaving the pair
  alone. Sentinels for "missing" must be **finite** — see `UNRANKED_IMPORTANCE`
  (`Number.MAX_SAFE_INTEGER`) in `src/common/ado/fetchAdoTree.ts`.
- **Missing data sorts last, not first.** An item with no ETA / no rank must fall to the bottom of
  its group; sorting it first promotes exactly the items nobody has triaged.
- **Keep the sort stable.** `orderItems` copies before sorting and relies on `Array.prototype.sort`
  being stable, so ties keep query order. Do not sort in place, and do not add a tiebreaker that
  reorders equal items.

### 4. Teach a view to apply it

A view never compares items itself. In the renderer:

```typescript
import { orderItems, type OrderingPolicy } from "../../../common/ordering/ItemOrdering";

/** Adapts a domain item to what the policies ask for, then unwraps the ordered result. */
function orderTrackedItems(items: TrackedWorkItem[], policy: OrderingPolicy): TrackedWorkItem[] {
  const orderable = items.map((item) => ({
    item,
    importance: item.importance,
    title: item.title,
    eta: epochOf(item.eta), // ISO string on the item, epoch ms in the contract
  }));
  return orderItems(orderable, policy).map((entry) => entry.item);
}
```

`orderItems` is generic over the wrapper (`<T extends OrderableItem>`), so the wrapper carries the
real node through and comes back out the other side.

Apply it at **every** place the view lists items — each level of a tree, and any rollup/popup that
summarizes items — so one board never shows two different orders. In Project Tracking that is
`renderTree` and `createMinorChildrenBadge`.

### 5. Read the policy from the binding, never from `properties` directly

The stored value is a string a _different build_ may have written. Route it through the view-config
reader (`orderingPolicyOf` in `projectTrackingViewType.ts`), which defaults it and matches it back
against `ORDERING_POLICIES` — so a policy that no longer exists falls back instead of reaching a
comparator that cannot handle it. Declare the `ViewTypeProperty` as a module constant and have both
the `ViewType` and the reader use it, so the key, options and default cannot drift apart.

### 6. If the policy needs a field ADO is not fetching yet

Sort keys come from the work item. Adding one is a four-step change:

1. Add the reference name to `TRACKING_FIELDS` in `src/common/ado/fetchAdoTree.ts` (prefer a stock
   process-template field; a field the org does not have fails the whole batch read).
2. Add the property to `TrackedWorkItem` in `src/common/ado/TrackedWorkItem.ts`.
3. Hydrate it in `hydrateTrackedWorkItem`, with an explicit sentinel for "ADO returned none".
4. Update **every** `TrackedWorkItem` fixture — `tsc` lists them; run `pnpm typecheck` first and fix
   the list it prints rather than hunting by hand.

## Documentation

- `src/common/ordering/README.md` — the policy list, and the adapter guidance for callers.
- The owning view's `README.md` — what each policy means on that board.
- `ChangeLog.md` — one user-facing bullet under `## Next Version` → `### New Features` (a new sort
  order is visible). Add that H3 heading only if the section does not have it yet; see the
  changelog-versioning skill for the grouping rules.

## Tests

- `src/common/ordering/ItemOrdering.test.ts` — the comparator itself: ordering, ties keep original
  order, missing data sorts last, and the input array is not mutated.
- The view's test file — that the rendered rows come out in policy order. Give the fixture items
  **different** rank / title / ETA orders, otherwise a passing test proves nothing about which
  policy ran.
- The view-config test — default, a stored policy, and a policy this build no longer offers.

## Verify

```
pnpm exec vitest run src/common/ordering src/content/views
pnpm verify
```

`pnpm verify` is the gate: format, lint (zero warnings), typecheck, jscpd, tests, coverage ≥ 85%.

## References

- Policies: `src/common/ordering/ItemOrdering.ts` + `README.md`
- Property resolution: `src/common/view-common/ViewType.ts` (`resolveViewTypePropertyValue`)
- Reference consumer: `src/content/views/project-tracking/ProjectTrackingView.ts`
  (`orderTrackedItems`) and `projectTrackingViewType.ts` (`orderingPolicyOf`)
- Sort-key hydration: `src/common/ado/fetchAdoTree.ts` (`TRACKING_FIELDS`, `UNRANKED_IMPORTANCE`)
