# ItemDetails Control

`renderItemDetailsButton` builds the shared themed `?` affordance and exposes `setExpanded`.
`renderItemDetailsContent` renders Created, Last Modified, and the sanitized description. Callers own
whether that content appears inline or in a popup.

`renderItemDetailsPanel` composes those primitives into the standard hidden inline panel and returns
the toggle plus `isExpanded` / `setExpanded`. Supply view-specific class names only when the owning
view needs selectors for layout or tests; description rendering and type-color emphasis stay shared.
