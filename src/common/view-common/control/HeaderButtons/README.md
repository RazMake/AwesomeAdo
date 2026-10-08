# Header Buttons

`renderHeaderButton` builds the fixed-square themed actions used in enhanced-view header bands.
`renderHeaderTextButton(doc, { className, label })` builds a worded action of the same height (the
`ToggleButton` base and the Consumers View's **Add Consumer**), and
`setHeaderButtonAvailability(button, reason, enabledTitle)` disables and dims it with `reason` as
its tooltip, or restores it with `enabledTitle` when `reason` is `null`.
`renderRefreshButton` adds the shared refresh icon and idle, busy, and failed states; a failed
refresh remains clickable so the owning view can open Diagnostics. Wire the refresh button's click
through `refreshRequestOf(event)`: it yields a `RefreshRequest` whose `discardCaches` is true for a
Ctrl+click (Cmd+click on macOS), which every view treats as "forget what this page remembered and
re-read everything" — even over a failed state. Header buttons keep their fixed
footprint when a wrapping header becomes narrow, so the row moves a complete action instead of
squeezing its glyph.
