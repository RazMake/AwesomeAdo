# `common/view-common/control/TreeRow`

The building blocks of one row in an outline board — twisty, type icon, title, the row line, its
wrapper, and the indented branch beneath it. The All Projects Catalog and the Consumers View build
their rows from these so both trees look and behave identically.

## Public API

`TreeRow.ts`. Every function takes a class `prefix` (for example `awesomeado-projects`), so each
board keeps its own class namespace for tests and styling while sharing one look.

| Function                                         | Renders                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `renderTreeTwisty(doc, prefix, item, options)`   | A `${prefix}__twisty` expand/collapse button, or a same-width `${prefix}__twisty-spacer` when `options` is null. |
| `renderTreeTypeIcon(doc, item, entry)`           | The Azure DevOps type icon, neutral when the catalog does not know the type.                                     |
| `renderTreeTitle(doc, prefix, item, entry)`      | The `${prefix}__title` text in the type's color, with a `Type id: title` tooltip.                                |
| `renderTreeRowLine(doc, prefix, topLevelClass)`  | The `${prefix}__row` flex line; a non-null `topLevelClass` marks top-level rows, which read one size larger.     |
| `renderTreeItemWrapper(doc, prefix, item, line)` | The `${prefix}__item` element (carrying `data-item-id`) that holds the line and its children.                    |
| `renderTreeChildren(doc, prefix)`                | The indented `${prefix}__children` branch with a guide line down its left edge.                                  |
| `treeRowEmphasisClasses(prefix)`                 | The `RowEmphasis` class set matching the elements above.                                                         |

`TreeTwistyOptions` is `{ expanded, onToggle }`; the owner records the new state in `onToggle` and
repaints, so it survives the rebuild.

The title is deliberately inert text rather than a link: the row's right-click menu offers **Open in
ADO**, so a slip while dragging or scrolling never navigates away.

## Example

```typescript
const line = renderTreeRowLine(doc, "awesomeado-consumers", depth === 0 ? "is-consumer" : null);
line.append(
  renderTreeTwisty(doc, "awesomeado-consumers", item, { expanded, onToggle }),
  renderTreeTypeIcon(doc, item, entry),
  renderTreeTitle(doc, "awesomeado-consumers", item, entry),
);
const wrapper = renderTreeItemWrapper(doc, "awesomeado-consumers", item, line);
```
