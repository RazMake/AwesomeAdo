# Item Status

`renderItemStatusBadge(options)` is the shared editable Status badge used by Project Tracking rows
and Consumers View rows. It shows the item's application Status (its mapped board-column label),
offers every column the item's type maps, persists a pick through the board's write queue, and only
moves the label once Azure DevOps accepted the change. `onCommitted` runs after that, for boards
whose other rows depend on the new Status.

`widestStatusLabelLength(items, types)` is the shared badge width, in characters, for a board:
every selectable column label plus the displayed Status of each item and its descendants. Pass it as
`minWidthCh` so every badge on the board is the same width.
