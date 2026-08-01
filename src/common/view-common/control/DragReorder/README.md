# DragReorder

Shared row drag-and-drop mechanics for enhanced views. The controller turns explicitly registered
title handles into drag sources, resolves neighbour-based placements against complete sibling lists,
and delegates persistence and model mutation to the owning view.

## Public API

- `DragReorderController` registers rows and emits a `PlannedMove` after a legal drop.
- `DropIndicator` renders theme-aware insertion and re-parent feedback.
- `placementOf` and `resolveMove` provide DOM-free placement calculations.

Register only rows whose owning view currently permits manual ordering. Supply every sibling id,
including filtered-out rows, so removing a filter does not reveal a different placement.
