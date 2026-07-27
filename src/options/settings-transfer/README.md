# `options/settings-transfer`

Wires the Appearance tab's **Import / Export** controls to both the settings store and the query
binding store, so one file captures and restores the user's whole configuration. The file format
and the pure serialize/parse logic live in
[`common/settings-transfer`](../../common/settings-transfer/README.md); this controller is only the
options-page glue.

## Public API

### `SettingsTransferController.ts`

- `SettingsTransferElements` — the elements the controller drives: `exportButton`, `importButton`,
  the hidden `fileInput`, and a `status` line.
- `new SettingsTransferController(settingsStore, bindingStore, elements, reportError?, onImported?)`
  — construct with the two store abstractions.
  - `init()` — attach the click/change listeners.
  - `dispose()` — detach them and stop updating status.
  - `onImported` — called once both stores have been written, so the composition root can tell the
    page sections that read their values only at load (the Azure DevOps tab, the query-binding form)
    to re-read them. Without it those sections keep showing — and on the next edit re-save — the
    configuration the file just replaced. It is not called when a file is rejected outright.

**Export** reads both stores, builds the `AwesomeADO.config` JSON, and downloads it. **Import** opens
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
