# tag-selection

Shared tag filtering for enhanced views that let a reader narrow their board by Azure DevOps tags —
the All Projects Catalog and the Consumers View.

## `tagCondition.ts`

| Export                                       | Purpose                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `TagCondition`                               | `{ required, excluded, matchAll }`, every key lower-cased.             |
| `emptyTagCondition()`                        | A condition that narrows nothing.                                      |
| `isEmptyTagCondition(condition)`             | Whether the condition narrows anything.                                |
| `tagKeys(item)`                              | An item's tags trimmed, blank-free, and lower-cased.                   |
| `tagsInUse(items, excluded?)`                | The distinct tags worn by `items` (first spelling wins), sorted.       |
| `carriesRequiredTags` / `carriesExcludedTag` | One item's own tags against each half of a condition.                  |
| `matchesTagCondition(item, condition)`       | The item's OWN tags satisfy the condition (for flat lists).            |
| `describeTagCondition(condition)`            | A one-phrase description for diagnostics logs.                         |
| `pruneTagCondition(condition, offered)`      | `{ condition, dropped }` — the condition minus tags no longer offered. |

Tree-shaped boards decide their own climbing/descending rules (see the catalog's
`idsKeptByTagCondition`); this module only judges single items.

## `TagConditionFilter.ts`

`renderTagConditionFilter(doc, { tags, condition, onChange })` builds the header's **Tags** dropdown:
quick search, include/exclude, any/all combining, and a trigger that clears an active condition in
one press. `onChange` fires on every tick with the new `TagCondition`; repaint only the list so the
open dropdown survives. `tagConditionOf(selection)` converts a raw checkbox selection.

## `tagConditionUrl.ts`

`readUrlTagCondition(search)` and `searchWithTagCondition(search, condition)` keep the condition in
the page URL (`tags`, `notTags`, `tagMatch=all`) so the address bar is a shareable link to what is on
screen.
