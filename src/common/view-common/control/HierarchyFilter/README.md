# Hierarchy Filter

`renderHierarchyFilter` renders the Sprint View's fixed Project button and a themed, indented
single-select popup. Callers provide work items in depth-first order and receive one selected item id
or `null` for all projects. Sprint View supplies only ancestor chains of items eligible for its
current queue, excluding the Project selection itself so readers can switch between alternatives.

Each option supplies its raw work-item title plus its type name, icon URL, and color. The popup puts
the shared type icon before the title instead of repeating the type as text. It sizes to its content
until it reaches the window margin, then truncates labels with an ellipsis and exposes the full label
in a tooltip. Its focused quick search matches titles case-insensitively at any position and retains
every matching item's visible ancestors so filtering never flattens the hierarchy.
