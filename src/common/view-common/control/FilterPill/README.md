# Filter Pill

`filterPillStyle` supplies the compact Feature Crew tag geometry and selected treatment for
enhanced-view filter pills. `appendFilterPillCounts` adds 14px queue-total and active-item circles
used by people filters without making those pills taller than user tags.

`renderFilterPillCount` builds one labelled count circle for controls with different count
semantics, such as Sprint View's marker-tag totals and Interrupt acceptance split.

`renderFilterPillFamilies` groups full-opacity pills into wrapping semantic families with `6px`
internal spacing and a larger `16px` gap between families. Selected pills remain distinguished by
their themed border.
