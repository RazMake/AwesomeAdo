# `options/settings-transfer`

Wires the Appearance tab's **Configuration Sharing** card to both the settings store and the query
binding store. Its Import / Export controls capture and restore the user's whole configuration, and
its Team configuration controls share that same configuration through an Azure DevOps work item. The
file format and the pure serialize/parse logic live in
[`common/settings-transfer`](../../common/settings-transfer/README.md); this controller is only the
options-page glue.

## Public API

### `SettingsTransferController.ts`

- `SettingsTransferElements` — the elements the controller drives: `exportButton`, `importButton`,
  the hidden `fileInput`, and a `status` line.
- `new SettingsTransferController(settingsStore, bindingStore, teamConfigSourceStore, elements,
reportError?, onImported?)` — construct with all three store abstractions.
  - `init()` — attach the click/change listeners.
  - `dispose()` — detach them and stop updating status.
  - `onImported` — called once both stores have been written, so the composition root can tell the
    page sections that read their values only at load (the Azure DevOps tab, the query-binding form)
    to re-read them. Without it those sections keep showing — and on the next edit re-save — the
    configuration the file just replaced. It is not called when a file is rejected outright.

**Export** reads all three stores, builds the `AwesomeADO.config` JSON (including the trusted team
configuration work item ID), and downloads it. **Import** opens
the hidden file input, reads the chosen file, applies every setting and binding the file supplies
usably — settings as a partial (so a value the file omitted or got wrong keeps what the user has
today) and bindings via **`replaceAll`**, so the file is authoritative about which queries are
enhanced. A file that yields nothing usable is reported and never touches either store.

The `status` line reports the outcome and carries `card__hint--error` when that outcome is a
failure. A file that imported only **partly** counts as one: the skipped values are recorded through
`reportError` (and so reach the Diagnostics log) and the line turns red, because the values that
were dropped are exactly the ones the user would otherwise hunt for long after a green "Imported
your configuration." scrolled by.

Like the Diagnostics log export, the download and file read use ambient browser APIs (`Blob`, `URL`,
the file input) directly; only `chrome.*` is injected, and that reaches the controller through the
injected store abstractions.

### `TeamConfigController.ts`

Drives the Team configuration subsection of Configuration Sharing on Appearance:

- **Connect** validates and saves the trusted work item id, then applies its full Description. Once
  connected, the editable ID is replaced by a link to that work item in ADO; the button reads
  **Connected** and stays disabled until Disconnect is used.
- **Pull Now** refreshes settings and bindings immediately.
- **Publish Config** explicitly replaces Description with the current full snapshot, then links the
  published work item ID to its Azure DevOps page.
- **Disconnect** stops future automatic pulls without deleting the last configuration already
  applied locally.

`setAdoReachable(reachable)` turns Connect, Pull Now, and Publish Config off while Azure DevOps
cannot be reached — all three run through an ADO tab's page world, so with none open they could only
fail. Disconnect only clears the locally stored source, so it stays available.

Successful pulls notify the same options-page reload callback as file import, so read-once sections
cannot display or later re-save stale values. Publish conflicts and malformed remote configuration
remain connected but surface as failures in both the card and Diagnostics.
