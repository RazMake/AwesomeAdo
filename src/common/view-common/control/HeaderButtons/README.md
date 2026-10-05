# Header Buttons

`renderHeaderButton` builds the fixed-square themed actions used in enhanced-view header bands.
`renderRefreshButton` adds the shared refresh icon and idle, busy, and failed states; a failed
refresh remains clickable so the owning view can open Diagnostics. Wire the refresh button's click
through `refreshRequestOf(event)`: it yields a `RefreshRequest` whose `discardCaches` is true for a
Ctrl+click (Cmd+click on macOS), which every view treats as "forget what this page remembered and
re-read everything" — even over a failed state. Header buttons keep their fixed
footprint when a wrapping header becomes narrow, so the row moves a complete action instead of
squeezing its glyph.
