# VersionLabel

Renders the compact AwesomeADO version marker for an enhanced-view header.

## API

`renderVersionLabel(doc, version)` returns a themed **link** displaying the version as `v **M.m**`.

It takes the full built version (`Major.Minor.Build`) but shows only **Major.Minor**: this repo
publishes a Major.Minor release to the stores, while the build segment is CI's own run counter and
names no version a user can install or report a bug against. A version with no build segment, or a
bare major, is shown as-is / completed to `M.0`.

Clicking it opens the extension's **Microsoft Edge Add-ons listing** in a new tab (`target="_blank"`
with `rel="noopener noreferrer"`, since the marker is injected into ADO's own page). The listing's
product id is hard-coded: it identifies a published listing rather than a user or an install, is
already public in the listing URL and in every user's `edge://extensions`, and is a CI secret only
because it sits beside the actual publishing credentials. The bare-id URL form needs no name slug, so
renaming the extension cannot break the link.

The control uses the active theme's secondary foreground with a dashed underline, so it stays
deliberately subdued in every extension theme while still reading as clickable.

`VERSION_MARKER_GAP_PX` is the clear space the marker needs beside a neighbouring control. Both view
headers sit it immediately left of the ordering picker and apply this as its right margin: flush
together, a link off to the store and a control that changes what the board shows read as one thing.
