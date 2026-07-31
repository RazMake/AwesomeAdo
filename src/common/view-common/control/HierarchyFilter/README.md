# Hierarchy Filter

`renderHierarchyFilter` renders the Sprint View's fixed Project button and a themed, indented
single-select popup. Callers provide work items in depth-first order and receive one selected item id
or `null` for all projects. Sprint View supplies only ancestor chains of items eligible for its
current queue, excluding the Project selection itself so readers can switch between alternatives.
