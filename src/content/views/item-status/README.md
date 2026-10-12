# Item Status

`renderItemStatusBadge(options)` is the shared editable Status badge used by delivery-work views. It
shows the item's application Status (its mapped board-column label), offers every column the item's
type maps, persists a pick through the board's write queue, and only moves the label once Azure
DevOps accepted the change. `onCommitted` runs after that, for boards whose other rows depend on the
new Status.

`persistItemState(options)` is the shared persist-then-reflect operation for state controls with
their own labels or palettes. It serializes the raw ADO state write, updates the item's state,
revision, and state-change timestamp after acceptance, then invokes `onAccepted`.
`reflectAcceptedState(item, state, rev, now)` is that post-acceptance fold on its own.

`changeItemState(options)` moves an item to any target state even when Azure DevOps forbids the
change directly. Pass the candidate `targets` (first preferred) and the view's
`IWorkItemStateTransitionsReader`; it reads the type's transitions, takes the shortest allowed route
to the first reachable target, and writes each hop as its own guarded revision through the queue,
waiting for one to be accepted before the next. `onAccepted` runs once the final state is reached;
`onStopped` runs when a later hop fails and the item is left in an intermediary state. Without a
transition map (or with no route) it writes the first target directly.

`widestStatusLabelLength(items, types)` is the shared badge width, in characters, for a board:
every selectable column label plus the displayed Status of each item and its descendants. Pass it as
`minWidthCh` so every badge on the board is the same width.
